const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, '../../uploads/catalogos');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({ dest: uploadDir });


// Buscar Lista de Atividades
router.get('/atividades', async (req, res) => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        // Retorna apenas atividades que possuem clientes vinculados
        const sql = `
            SELECT A.CODATIV, A.RAMO 
            FROM PCATIVI A
            WHERE EXISTS (SELECT 1 FROM PCCLIENT C WHERE C.CODATV1 = A.CODATIV)
            ORDER BY A.RAMO
        `;
        const result = await conn.execute(sql);
        
        const atividades = result.rows.map(row => ({
            codatv: row[0] ?? row.CODATIV,
            ramo: row[1] ?? row.RAMO
        }));
        
        res.json({ success: true, atividades });
    } catch (err) {
        console.error('[CATALOGO] Erro ao buscar atividades:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar atividades' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

// Buscar Produtos do Catálogo (Opcionalmente filtrado por Atividade)
router.get('/produtos', async (req, res) => {
    const { codatv1 } = req.query;
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let withClause = '';
        let joinClause = '';
        let whereClause = '';
        let binds = {};

        if (codatv1 && codatv1 !== 'null' && codatv1 !== 'undefined') {
            withClause = `
                WITH CLIENTES_ATIVIDADE AS (
                    SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv1
                ),
                COMPRAS_GERAIS AS (
                    SELECT M.CODPROD
                    FROM PCMOV M
                    JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
                    WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                    GROUP BY M.CODPROD
                )
            `;
            joinClause = `JOIN COMPRAS_GERAIS CG ON CG.CODPROD = P.CODPROD`;
            binds.codatv1 = codatv1;
        }

        const sql = `
            ${withClause}
            SELECT 
                P.CODPROD, 
                P.DESCRICAO, 
                P.CODEPTO, 
                NVL(D.DESCRICAO, 'OUTROS') AS DEPARTAMENTO, 
                NVL(PR.PVENDA, 0) AS PVENDA, 
                PE.CODAUXILIAR AS EAN, 
                PE.QTUNIT, 
                PE.UNMEDIDA AS UNIDADE_EMB
            FROM PCPRODUT P
            JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '1'
            LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
            LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
            ${joinClause}
            OUTER APPLY (
                SELECT CODAUXILIAR, QTUNIT, UNMEDIDA
                FROM PCEMBALAGEM PE2
                WHERE PE2.CODPROD = P.CODPROD
                AND NVL(PE2.ENVIAFV, 'N') = 'S' 
                AND PE2.DTINATIVO IS NULL
                ORDER BY PE2.QTUNIT DESC
                FETCH FIRST 1 ROWS ONLY
            ) PE
            WHERE NVL(P.OBS2, 'X') NOT IN ('FL')
            AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
            ORDER BY NVL(D.DESCRICAO, 'OUTROS'), P.DESCRICAO
        `;

        const result = await conn.execute(sql, binds);

        const produtos = result.rows.map(row => ({
            codprod: row[0],
            descricao: row[1],
            codepto: row[2],
            departamento: row[3],
            preco: row[4],
            ean: row[5] || '',
            qtunit: row[6] || 1,
            unidade: row[7] || 'UN'
        }));

        res.json({ success: true, produtos });
    } catch (err) {
        console.error('[CATALOGO] Erro ao buscar produtos do catálogo:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar produtos' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

// Enviar Catálogo via WhatsApp
router.post('/send-whatsapp', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Arquivo PDF não enviado.' });
        }

        const { clientes, vendedorId, telefoneVendedor, ramoNome, codusurLogged, mensagemPadrao } = req.body;
        if (!clientes) {
            return res.status(400).json({ success: false, error: 'Lista de clientes vazia.' });
        }

        const clientesList = JSON.parse(clientes);
        if (clientesList.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de clientes vazia.' });
        }

        const pdfPath = req.file.path;
        // O marcador que o filaCron.js vai entender
        const msgTexto = `[MEDIA_CATALOGO]${pdfPath}|${ramoNome}|${mensagemPadrao || ''}`;

        let conn;
        try {
            conn = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });

            // 1. Inserir na Fila (CANAL_REATIVACAO_FILA) para cada cliente
            // O filaCron.js lerá e enviará com a regra de delay.
            const sqlInsert = `
                INSERT INTO CANAL_REATIVACAO_FILA (ID, CODCLI, TELEFONE, CODUSUR, MENSAGEM_TXT, CODATV1, STATUS, DATA_CRIACAO)
                VALUES (SEQ_CANAL_REATIVACAO_FILA.NEXTVAL, :codcli, :telefone, :codusur, :mensagem, :codatv1, 'PENDENTE', SYSDATE)
            `;
            
            const binds = clientesList.map(c => ({
                codcli: c.codcli,
                telefone: c.telefone || '',
                codusur: codusurLogged || vendedorId || 9999,
                mensagem: msgTexto,
                codatv1: null // Nao precisamos usar no filaCron pq não vai processar imagem de produto individual
            }));

            await conn.executeMany(sqlInsert, binds, { autoCommit: true });

            // 2. Enviar Resumo + PDF para o Vendedor Imediatamente (se o telefone foi informado)
            if (telefoneVendedor && telefoneVendedor.length >= 10) {
                // Monta o resumo
                let resumoMsg = `*Relatório de Disparo do Catálogo*\n\nRamo: ${ramoNome}\nSegue o catálogo enviado aos Clientes.\nAbaixo a lista de clientes que receberam:\n\n`;
                clientesList.forEach(c => {
                    // Limpa tel
                    const telNumbers = (c.telefone || '').replace(/\D/g, '');
                    resumoMsg += `- ${c.nome.trim()} - Link: wa.me/55${telNumbers}\n`;
                });

                // Aqui usamos o codusurLogged para pegar o Token da Evolution
                const tokenRes = await conn.execute(`
                    SELECT T.INSTANCE_NAME, T.API_TOKEN, COALESCE(T.API_URL, G.VALOR) AS URL_BASE
                    FROM CANAL_TOKENS_EVOLUTION T
                    LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
                    WHERE T.CODUSUR = :codusur
                `, { codusur: codusurLogged || vendedorId });
                
                if (tokenRes.rows.length > 0) {
                    const instanceName = tokenRes.rows[0][0];
                    const token = tokenRes.rows[0][1];
                    let urlBase = tokenRes.rows[0][2];
                    if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
                    
                    const headers = { 'apikey': token, 'instance': instanceName, 'Content-Type': 'application/json' };
                    
                    // a) Enviar Texto Resumo
                    await fetch(`${urlBase}/message/sendText/${instanceName}`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ number: telefoneVendedor, text: resumoMsg })
                    }).catch(e => console.error('Erro enviar resumo:', e));

                    // b) Enviar Arquivo PDF
                    const fileBuffer = fs.readFileSync(pdfPath);
                    const base64Data = fileBuffer.toString('base64');
                    
                    await fetch(`${urlBase}/message/sendMedia/${instanceName}`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({
                            number: telefoneVendedor,
                            mediatype: 'document',
                            mimetype: 'application/pdf',
                            fileName: `Catalogo_${ramoNome}.pdf`,
                            caption: `Catálogo de Produtos - ${ramoNome}`,
                            media: base64Data
                        })
                    }).catch(e => console.error('Erro enviar PDF pro vendedor:', e));
                }
            }
            
            res.json({ success: true, message: 'Disparos incluídos na fila com sucesso.' });
        } catch (dbErr) {
            console.error('Erro banco de dados disparos catálogo:', dbErr);
            res.status(500).json({ success: false, error: 'Erro ao processar disparo.' });
        } finally {
            if (conn) {
                try { await conn.close(); } catch(e) {}
            }
        }
    } catch (err) {
        console.error('Erro POST send-whatsapp:', err);
        res.status(500).json({ success: false, error: 'Erro no servidor' });
    }
});

module.exports = router;
