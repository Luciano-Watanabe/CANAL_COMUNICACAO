const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const path = require('path');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `oportunidade_${Date.now()}${ext}`);
    }
});

const upload = multer({ storage });

// Buscar clientes para oportunidade
router.get('/clientes', async (req, res) => {
    const { codusur, role, ignorarRecentes, codatv1, dtultcomp } = req.query;
    
    if (!codusur || codusur === 'undefined' || codusur === 'null' || isNaN(Number(codusur))) {
        return res.json({ success: true, clientes: [] });
    }

    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    
    let extraFilter = '';
    let queryParams = { cod: codusur };
    
    // Filtro de Atividade
    if (codatv1 && codatv1 !== 'null' && codatv1 !== 'TODOS') {
        extraFilter += ' AND C.CODATV1 = :codatv1 ';
        queryParams.codatv1 = codatv1;
    }

    // Filtro de Dtultcomp (Data inicial)
    if (dtultcomp && dtultcomp !== 'null') {
        extraFilter += " AND C.DTULTCOMP >= TO_DATE(:dtultcomp, 'YYYY-MM-DD') ";
        queryParams.dtultcomp = dtultcomp;
    }

    // Filtro de 7 dias
    if (String(ignorarRecentes) === 'true') {
        extraFilter += ` AND NOT EXISTS (
            SELECT 1 FROM CANAL_REATIVACAO_FILA F 
            WHERE F.CODCLI = C.CODCLI 
              AND F.DATA_CRIACAO >= TRUNC(SYSDATE) - 7
              AND UPPER(F.MENSAGEM_TXT) LIKE '%[OPORTUNIDADE]%'
        ) `;
    }
    
    extraFilter += ` AND (
        EXISTS (SELECT 1 FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL))
        OR EXISTS (SELECT 1 FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND TELEFONE IS NOT NULL)
    ) `;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = '';
        if (roleUpper === 'BOT_GESTOR') {
            delete queryParams.cod;
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE C.DTEXCLUSAO IS NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                ORDER BY C.CLIENTE ASC
            `;
        } else {
            // Se for gerente ou supervisor a regra muda igual clientes.js, simplificando para vendedor:
            sql = `
                SELECT C.CODCLI, C.FANTASIA, C.CLIENTE AS RAZAO_SOCIAL, U.NOME AS VENDEDOR, 
                       TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP,
                       A.RAMO AS RAMO_ATIVIDADE,
                       COALESCE(
                           (SELECT LISTAGG(NVL(TELEFONE, CELULAR), ',') WITHIN GROUP (ORDER BY CODCONTATO) FROM PCCONTATO WHERE CODCLI = C.CODCLI AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL)),
                           (SELECT TELEFONE FROM VW_CANAL_CLIENTES WHERE CODCLI = C.CODCLI AND ROWNUM = 1)
                       ) AS CONTATO,
                       C.CODATV1
                FROM PCCLIENT C
                LEFT JOIN PCUSUARI U ON U.CODUSUR = C.CODUSUR1
                LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                WHERE C.CODUSUR1 = :cod
                  AND C.DTEXCLUSAO IS NULL
                  ${extraFilter}
                  AND UPPER(C.CLIENTE) NOT LIKE '%CONSUMIDOR FINAL%'
                ORDER BY C.CLIENTE ASC
            `;
        }

        const result = await connection.execute(sql, queryParams);
        const clientes = result.rows.map(r => ({
            codcli: r[0],
            fantasia: r[1],
            razao_social: r[2],
            vendedor: r[3],
            dtultcomp: r[4],
            ramo_atividade: r[5],
            telefone: r[6],
            codatv1: r[7]
        }));
        
        return res.json({ success: true, clientes });
    } catch (err) {
        console.error('Erro ao buscar clientes oportunidade:', err);
        return res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Enviar Campanha de Oportunidade
router.post('/enviar', upload.single('media'), async (req, res) => {
    try {
        const { clientes, legenda, vendedorResponsavel, catalogoOpcao, ramoNome, codusurLoggedIn } = req.body;
        
        if (!clientes) {
            return res.status(400).json({ success: false, error: 'Lista de clientes vazia.' });
        }

        const clientesList = JSON.parse(clientes);
        if (clientesList.length === 0) {
            return res.status(400).json({ success: false, error: 'Lista de clientes vazia.' });
        }

        // Caminho da mídia (se houver)
        const mediaPath = req.file ? req.file.path : '';

        // Formatação do marcador para o filaCron.js
        // Ex: [OPORTUNIDADE]/caminho/arquivo.ext|IDVENDEDOR|CATALOGO(GERAL ou ramoId)|Legenda
        const catOpcao = catalogoOpcao || 'NONE';
        const msgTexto = `[OPORTUNIDADE]${mediaPath}|${vendedorResponsavel}|${catOpcao}|${legenda || ''}`;

        let conn;
        try {
            conn = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });

            // 1. Inserir na Fila (CANAL_REATIVACAO_FILA) para cada cliente
            const sqlInsert = `
                INSERT INTO CANAL_REATIVACAO_FILA (ID, CODCLI, TELEFONE, CODUSUR, MENSAGEM_TXT, CODATV1, STATUS, DATA_CRIACAO)
                VALUES (SEQ_CANAL_REATIVACAO_FILA.NEXTVAL, :codcli, :telefone, :codusur, :mensagem, :codatv1, 'PENDENTE', SYSDATE)
            `;
            
            const binds = clientesList.map(c => {
                let parsedCodcli = c.codcli;
                if (typeof parsedCodcli === 'string' && parsedCodcli.startsWith('AVULSO')) {
                    parsedCodcli = null;
                }
                
                return {
                    codcli: parsedCodcli || null,
                    telefone: c.telefone || '',
                    codusur: codusurLoggedIn || vendedorResponsavel || 9999,
                    mensagem: msgTexto,
                    codatv1: c.codatv1 || null
                };
            });

            await conn.executeMany(sqlInsert, binds, { autoCommit: true });

            res.json({ success: true, message: 'Campanha de Oportunidade enviada para fila de processamento.' });
        } catch (dbErr) {
            console.error('Erro banco de dados disparos oportunidade:', dbErr);
            res.status(500).json({ success: false, error: 'Erro ao processar disparo.' });
        } finally {
            if (conn) {
                try { await conn.close(); } catch(e) {}
            }
        }
    } catch (err) {
        console.error('Erro POST enviar oportunidade:', err);
        res.status(500).json({ success: false, error: 'Erro no servidor' });
    }
});

// Gerar Legenda com IA (GROK)
router.post('/gerar-legenda', async (req, res) => {
    let conn;
    try {
        const { baseText } = req.body;
        
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const keyRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
        const groqKey = keyRes.rows.length > 0 ? keyRes.rows[0][0] : process.env.GROQ_API_KEY;
        
        if (!groqKey || groqKey === 'SUA_CHAVE_AQUI') {
            return res.status(500).json({ success: false, error: 'Chave GROQ não configurada.' });
        }

        const prompt = `Melhore a seguinte legenda de WhatsApp para uma campanha de vendas/oportunidade de negócios.
O texto original é: "${baseText || 'Confira essa oportunidade!'}"
Torne o texto persuasivo, comercial, simpático e atrativo. Use emojis adequados, mas sem exageros.
O texto final deve ser curto e direto (máximo 400 caracteres). Retorne apenas a legenda gerada, sem aspas ou marcações markdown.`;

        const iaRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'openai/gpt-oss-120b',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
        }, {
            headers: { 'Authorization': `Bearer ${groqKey}` }
        });

        if (iaRes.data && iaRes.data.choices && iaRes.data.choices.length > 0) {
            const legendaGerada = iaRes.data.choices[0].message.content.trim();
            res.json({ success: true, legenda: legendaGerada });
        } else {
            res.status(500).json({ success: false, error: 'Erro ao gerar legenda.' });
        }
    } catch (err) {
        console.error('Erro ao gerar legenda com GROQ:', err.response?.data || err.message);
        res.status(500).json({ success: false, error: 'Erro ao processar IA.' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

module.exports = router;
