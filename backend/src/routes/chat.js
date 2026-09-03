const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

function formatPhone(phone) {
    if (!phone) return null;
    let p = String(phone).replace(/[^0-9]/g, '');
    p = p.replace(/^0+/, '');
    if (p.length === 10 || p.length === 11) {
        p = '55' + p;
    }
    // Return formatted string even if length doesn't strictly match 12/13,
    // to avoid blocking some edge cases in sending, or enforce strict logic.
    if (!p.startsWith('55')) {
        p = '55' + p;
    }
    return p;
}

// Buscar histÃ³rico de mensagens de um cliente especÃ­fico com o vendedor logado
router.get('/history', async (req, res) => {
    const { codusur, telefone } = req.query;

    if (!codusur || !telefone) {
        return res.status(400).json({ success: false, error: 'codusur e telefone sÃ£o obrigatÃ³rios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Traz as Ãºltimas 50 mensagens
        const sql = `
            SELECT ID_MENSAGEM, SENTIDO, TEXTO, DATA_HORA, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE
            FROM CANAL_MENSAGENS
            WHERE CODUSUR = :codusur AND TELEFONE_CLIENTE = :telefone
            ORDER BY DATA_HORA ASC
        `;
        
        const result = await connection.execute(sql, { codusur, telefone });

        const mensagens = result.rows.map(row => ({
            id: row[0],
            sentido: row[1],
            texto: row[2],
            timestamp: row[3],
            mediaUrl: row[4] || null,
            mediaType: row[5] || null,
            mediaMime: row[6] || null
        }));

        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao buscar histÃ³rico:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});


// Buscar dados para cabecalho do orcamento (empresa e cliente)
router.get('/orcamento-dados/:codcli', async (req, res) => {
    const { codcli } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sqlEmpresa = `
            SELECT CODIGO, RAZAOSOCIAL, CGC, ENDERECO, BAIRRO, CIDADE, UF, CEP, TELEFONE
            FROM PCFILIAL
            WHERE CODIGO = COALESCE((SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'CODFILIAL'), '1')
        `;
        const resEmpresa = await connection.execute(sqlEmpresa);
        let empresa = null;
        if (resEmpresa.rows.length > 0) {
            const r = resEmpresa.rows[0];
            empresa = {
                codigo: r[0], razaoSocial: r[1], cnpj: r[2], endereco: r[3], bairro: r[4], cidade: r[5], uf: r[6], cep: r[7], telefone: r[8]
            };
        }

        const sqlCliente = `
            SELECT CODCLI, CLIENTE, CGCENT, ENDERENT, BAIRROENT, MUNICENT, ESTENT, CEPENT, TELENT
            FROM PCCLIENT
            WHERE CODCLI = :codcli
        `;
        const resCliente = await connection.execute(sqlCliente, { codcli });
        let cliente = null;
        if (resCliente.rows.length > 0) {
            const r = resCliente.rows[0];
            cliente = {
                codcli: r[0], nome: r[1], cnpj: r[2], endereco: r[3], bairro: r[4], cidade: r[5], uf: r[6], cep: r[7], telefone: r[8]
            };
        }

        const sqlConfig = `SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'VALIDADE_ORCAMENTO'`;
        const resConfig = await connection.execute(sqlConfig);
        let validadeOrcamento = '24 horas';
        if (resConfig.rows.length > 0 && resConfig.rows[0][0]) {
            validadeOrcamento = resConfig.rows[0][0];
        }

        res.json({ success: true, empresa, cliente, validadeOrcamento });
    } catch (err) {
        console.error('Erro ao buscar dados do orcamento:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Listar todas as conversas de todos os WhatsApp configurados (read-only)
router.get('/todas-conversas', async (req, res) => {
    const normalizeTel = (v) => String(v || '').replace(/[^0-9]/g, '');

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT 
                m.TELEFONE_CLIENTE,
                m.CODUSUR,
                NVL(t.NOME_ATENDENTE, u.NOME) AS NOME_CONTA,
                NVL(t.INSTANCE_NAME, 'SEM-INSTANCIA') AS INSTANCE_NAME,
                MAX(m.DATA_HORA) AS ULTIMA_MENSAGEM,
                COUNT(*) AS QT_MENSAGENS,
                (SELECT m2.TEXTO FROM CANAL_MENSAGENS m2 WHERE m2.TELEFONE_CLIENTE = m.TELEFONE_CLIENTE AND m2.CODUSUR = m.CODUSUR ORDER BY m2.DATA_HORA DESC FETCH FIRST 1 ROWS ONLY) AS PREVIEW,
                (SELECT m2.MEDIA_TYPE FROM CANAL_MENSAGENS m2 WHERE m2.TELEFONE_CLIENTE = m.TELEFONE_CLIENTE AND m2.CODUSUR = m.CODUSUR ORDER BY m2.DATA_HORA DESC FETCH FIRST 1 ROWS ONLY) AS ULTIMO_MEDIA_TYPE,
                (SELECT MAX(JSON_VALUE(CONTEUDO, '$.pushName')) FROM CANAL_WEBHOOK WHERE CONTEUDO LIKE '%' || m.TELEFONE_CLIENTE || '%') AS NOME_WHATSAPP
            FROM CANAL_MENSAGENS m
            LEFT JOIN CANAL_TOKENS_EVOLUTION t ON t.CODUSUR = m.CODUSUR
            LEFT JOIN PCUSUARI u ON u.CODUSUR = m.CODUSUR
            GROUP BY m.TELEFONE_CLIENTE, m.CODUSUR, NVL(t.NOME_ATENDENTE, u.NOME), NVL(t.INSTANCE_NAME, 'SEM-INSTANCIA')
            ORDER BY MAX(m.DATA_HORA) DESC
        `;

        const result = await connection.execute(sql);

        // Mapa de telefone normalizado -> nome do cliente (PCCLIENT + PCCONTATO)
        const clientMap = {};
        const resClientes = await connection.execute(`
            SELECT CLIENTE, FANTASIA, TELCELENT, TELENT, TELCOM, TELCOB FROM PCCLIENT
        `);
        for (const row of resClientes.rows) {
            const nome = (row[1] || row[0] || '').trim();
            if (!nome) continue;
            [row[2], row[3], row[4], row[5]].forEach(tel => {
                const norm = normalizeTel(tel);
                if (norm.length >= 8 && !clientMap[norm]) clientMap[norm] = nome;
            });
        }
        const resContatos = await connection.execute(`
            SELECT CT.NOMECONTATO, CT.TELEFONE, CT.CELULAR FROM PCCONTATO CT
        `);
        for (const row of resContatos.rows) {
            const nome = (row[0] || '').trim();
            if (!nome) continue;
            [row[1], row[2]].forEach(tel => {
                const norm = normalizeTel(tel);
                if (norm.length >= 8 && !clientMap[norm]) clientMap[norm] = nome;
            });
        }

        const findClientName = (tel) => {
            const norm = normalizeTel(tel);
            if (!norm) return null;
            if (clientMap[norm]) return clientMap[norm];
            for (let len = Math.min(norm.length - 1, 11); len >= 8; len--) {
                const suffix = norm.slice(norm.length - len);
                if (clientMap[suffix]) return clientMap[suffix];
            }
            return null;
        };

        const conversas = result.rows.map(row => {
            const telefone = String(row[0] || '');
            let preview = row[6] || '';
            const mediaType = row[7] || null;
            if (mediaType === 'image') preview = preview ? preview : '[Imagem]';
            else if (mediaType === 'video') preview = preview ? preview : '[Video]';
            else if (mediaType === 'audio') preview = preview ? preview : '[Audio]';
            else if (mediaType === 'document') preview = preview ? preview : '[Documento]';
            return {
                telefone,
                codusur: row[1],
                nomeCliente: findClientName(telefone) || row[8] || null,
                nomeConta: row[2] || 'Conta ' + row[1],
                instanceName: row[3],
                ultimaMensagem: row[4],
                qtMensagens: row[5] || 0,
                preview,
                mediaType: mediaType || null
            };
        });

        res.json({ success: true, conversas });
    } catch (err) {
        console.error('Erro ao buscar todas as conversas:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar histÃ³rico de mensagens de um cliente especÃ­fico em um CODUSUR especÃ­fico (read-only, todas contas)
router.get('/todas-mensagens', async (req, res) => {
    const { codusur, telefone } = req.query;

    if (!codusur || !telefone) {
        return res.status(400).json({ success: false, error: 'codusur e telefone sÃ£o obrigatÃ³rios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT ID_MENSAGEM, SENTIDO, TEXTO, DATA_HORA, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE
            FROM CANAL_MENSAGENS
            WHERE CODUSUR = :codusur AND TELEFONE_CLIENTE = :telefone
            ORDER BY DATA_HORA ASC
        `;
        
        const result = await connection.execute(sql, { codusur, telefone });

        const mensagens = result.rows.map(row => ({
            id: row[0],
            sentido: row[1],
            texto: row[2],
            timestamp: row[3],
            mediaUrl: row[4] || null,
            mediaType: row[5] || null,
            mediaMime: row[6] || null
        }));

        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao buscar mensagens de todas as conversas:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar estatÃ­sticas de conversas (ex: Conversas Hoje)
router.get('/stats', async (req, res) => {
    const { codusur } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur Ã© obrigatÃ³rio' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT COUNT(DISTINCT TELEFONE_CLIENTE) AS CONVERSAS_HOJE
            FROM CANAL_MENSAGENS
            WHERE CODUSUR = :codusur
            AND TRUNC(DATA_HORA) = TRUNC(SYSDATE)
        `;
        
        const result = await connection.execute(sql, { codusur });
        const conversasHoje = result.rows[0][0] || 0;

        res.json({ success: true, conversasHoje });
    } catch (err) {
        console.error('Erro ao buscar stats do chat:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar dados para o grÃ¡fico do dashboard
router.get('/chart', async (req, res) => {
    const { codusur } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur Ã© obrigatÃ³rio' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT 
                TO_CHAR(M.DATA_HORA, 'HH24') AS HORA,
                COUNT(M.ID_MENSAGEM) AS TOTAL_MENSAGENS,
                COUNT(DISTINCT M.TELEFONE_CLIENTE) AS TOTAL_CONTATOS,
                COUNT(DISTINCT C.CODCLI) AS TOTAL_CLIENTES
            FROM CANAL_MENSAGENS M
            LEFT JOIN PCCONTATO C ON NVL(C.TELEFONE, C.CELULAR) = M.TELEFONE_CLIENTE
            WHERE M.CODUSUR = :codusur
            AND TRUNC(M.DATA_HORA) = TRUNC(SYSDATE)
            GROUP BY TO_CHAR(M.DATA_HORA, 'HH24')
            ORDER BY HORA ASC
        `;
        
        const result = await connection.execute(sql, { codusur });
        
        const chartData = result.rows.map(row => ({
            hora: row[0] + 'h',
            mensagens: row[1],
            contatos: row[2],
            clientes: row[3] || 0
        }));

        res.json({ success: true, chartData });
    } catch (err) {
        console.error('Erro ao buscar dados do grÃ¡fico:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});


// Enviar nova mensagem para a Evolution API
router.post('/send', async (req, res) => {
    if (!cacheService.isWithinAllowedSchedule()) {
        return res.status(403).json({ success: false, error: 'Fora do horÃ¡rio permitido para envios.' });
    }
    const { codusur, telefone, texto, messageId } = req.body;

    if (!codusur || !telefone || !texto) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // 1. Buscar a URL e o Token do vendedor
        const configResult = await connection.execute(`
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.CODUSUR = :codusur
        `, { codusur });

        if (configResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'InstÃ¢ncia Evolution nÃ£o configurada para este vendedor.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (!urlBase || !token || !instance) {
            return res.status(400).json({ success: false, error: 'ConfiguraÃ§Ã£o Evolution (URL ou Token) incompleta.' });
        }

        // Garante que a URL nÃ£o termine com barra
        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);

        // 2. Chamar a API da Evolution para enviar o texto
        
        // Formata o nÃºmero (DDI + DDD + Numero). Assumindo BR 55 se nÃ£o houver.
        let numberToSend = cacheService.getDestinoFinal(formatPhone(telefone));

        const evolutionUrl = `${urlBase}/send/text`;
        
        console.log(`[DEBUG] Tentando enviar para: ${evolutionUrl}`);
        console.log(`[DEBUG] InstÃ¢ncia: ${instance}`);
        console.log(`[DEBUG] Body: number=${numberToSend}, text=${texto}`);

        const randomDelayMs = Math.floor(Math.random() * (15000 - 1000 + 1)) + 1000;

        const evResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': token,
                'instance': instance
            },
            body: JSON.stringify({
                number: numberToSend,
                text: texto,
                delay: randomDelayMs
            })
        });

        const rawText = await evResponse.text();
        let evData = {};
        try {
            evData = JSON.parse(rawText);
        } catch (parseError) {
            console.error('Resposta nÃ£o-JSON da Evolution:', rawText);
            evData = { error: rawText };
        }

        if (!evResponse.ok || evData.error) {
            console.error('Erro na Evolution API:', rawText);
            return res.status(500).json({ success: false, error: 'Erro ao enviar via WhatsApp', details: rawText });
        }

        const idMensagem = evData.key?.id || `out_${Date.now()}`;

        // 3. Salvar no banco CANAL_MENSAGENS como OUT
        await connection.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
            VALUES (:id, :cod, :tel, 'OUT', :txt)
        `, {
            id: idMensagem,
            cod: codusur,
            tel: telefone,
            txt: texto
        }, { autoCommit: true });

        res.json({ success: true, message: 'Enviado com sucesso', id_mensagem: idMensagem });
    } catch (err) {
        console.error('Erro ao enviar mensagem:', err);
        res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

const fs = require('fs');
const path = require('path');

const getImagePath = (codprod) => {
    const imagesDir = process.env.IMAGES_DIR || path.join(__dirname, '../../imagens_produtos');
    const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'];
    if (!fs.existsSync(imagesDir)) return null;
    for (let ext of extensions) {
        const filePath = path.join(imagesDir, `${codprod}${ext}`);
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
};

router.post('/send-produto', async (req, res) => {
    if (!cacheService.isWithinAllowedSchedule()) {
        return res.status(403).json({ success: false, error: 'Fora do horÃ¡rio permitido para envios.' });
    }
    const { codusur, telefone, codprod, isCatalogoMode, legenda, idBase64Map, text } = req.body;
    console.log(`[CHAT] Recebido pedido send-produto: usr=${codusur}, tel=${telefone}, prod=${codprod}`);

    if (!codusur || !telefone || !codprod) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const configResult = await connection.execute(`
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.CODUSUR = :codusur
        `, { codusur });

        if (configResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'InstÃ¢ncia Evolution nÃ£o configurada.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        let numberToSend = cacheService.getDestinoFinal(formatPhone(telefone));

        const imagePath = getImagePath(codprod);
        
        // Se a imagem existe, envia via sendMedia
        if (imagePath) {
            const fileBuffer = fs.readFileSync(imagePath);
            const base64Data = fileBuffer.toString('base64');
            const mimetype = 'image/jpeg'; // Evolution aceita jpeg genericamente se for base64

            const evolutionUrl = `${urlBase}/message/sendMedia/${instance}`; // Endpoint fallback to v1, but some v2 use /message/sendMedia too
            const bodyPayload = {
                number: numberToSend,
                mediatype: 'image',
                mimetype: mimetype,
                fileName: `${codprod}.jpg`,
                caption: text || '',
                media: base64Data
            };

            const evoRes = await fetch(evolutionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': token,
                    'instance': instance
                },
                body: JSON.stringify(bodyPayload)
            });

            if (evoRes.status === 404) {
                // Tenta fallback para /send/media caso seja Evolution v2 pura
                const evolutionUrlV2 = `${urlBase}/send/media`;
                
                const bodyPayloadV2 = {
                    number: numberToSend,
                    type: 'image',
                    url: base64Data, // Evolution Go/V2 usa url para base64/url e type para mimetype
                    caption: text || '',
                    fileName: `${codprod}.jpg`,
                    mimetype: mimetype
                };

                const evoResV2 = await fetch(evolutionUrlV2, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    'apikey': token,
                    'instance': instance
                    },
                    body: JSON.stringify(bodyPayloadV2)
                });
                if (evoResV2.ok || evoResV2.status !== 404) {
                    const rawText = await evoResV2.text();
                    console.log(`[CHAT] EvoResV2 raw text:`, rawText);
                    let evoData = {};
                    try { evoData = JSON.parse(rawText); } catch (e) { return res.status(500).json({ success: false, error: 'Evolution API retornou resposta invalida.', raw: rawText }); }
                    if (!evoResV2.ok) return res.status(400).json({ success: false, error: evoData });
                    
                    // Salva no historico
                    const idMensagem = evoData.key?.id || evoData.data?.Info?.ID || `out_mix_${Date.now()}`;
                    await connection.execute(`
                        INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                        VALUES (:id, :cod, :tel, 'OUT', :txt)
                    `, {
                        id: idMensagem,
                        cod: codusur,
                        tel: telefone,
                        txt: `[Mix/Produto Enviado: ${codprod}]\n${text}`
                    }, { autoCommit: true });

                    return res.json({ success: true, result: evoData });
                }
            }

            const rawText = await evoRes.text();
            let evoData = {};
            try {
                evoData = JSON.parse(rawText);
            } catch (e) {
                console.error(`[Evolution API Error] Nao retornou JSON:`, rawText);
                return res.status(500).json({ success: false, error: 'Evolution API retornou resposta invalida.', raw: rawText });
            }

            if (!evoRes.ok) {
                 return res.status(400).json({ success: false, error: evoData });
            }

            // Salva no historico
            const idMensagem = evoData.key?.id || evoData.data?.Info?.ID || `out_mix_${Date.now()}`;
            await connection.execute(`
                INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                VALUES (:id, :cod, :tel, 'OUT', :txt)
            `, {
                id: idMensagem,
                cod: codusur,
                tel: telefone,
                txt: `[Mix/Produto Enviado: ${codprod}]\n${text}`
            }, { autoCommit: true });

            return res.json({ success: true, result: evoData });
        } else {
            // Fallback: envia apenas texto
            const evolutionUrl = `${urlBase}/message/sendText/${instance}`;
            const bodyPayload = {
                number: numberToSend,
                text: text || ''
            };

            const evoRes = await fetch(evolutionUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': token,
                    'instance': instance
                },
                body: JSON.stringify(bodyPayload)
            });

            if (evoRes.status === 404) {
                const evolutionUrlV2 = `${urlBase}/send/text`;
                const evoResV2 = await fetch(evolutionUrlV2, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': token,
                        'instance': instance
                    },
                    body: JSON.stringify(bodyPayload)
                });
                if (evoResV2.ok || evoResV2.status !== 404) {
                    const evoData = await evoResV2.json();
                    
                    // Salva no historico
                    const idMensagem = evoData.key?.id || evoData.data?.Info?.ID || `out_mix_txt_${Date.now()}`;
                    await connection.execute(`
                        INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                        VALUES (:id, :cod, :tel, 'OUT', :txt)
                    `, {
                        id: idMensagem,
                        cod: codusur,
                        tel: telefone,
                        txt: `[Mix/Produto Texto: ${codprod}]\n${text}`
                    }, { autoCommit: true });

                    return res.json({ success: true, result: evoData });
                }
            }

            const evoData = await evoRes.json();
            
            // Salva no historico
            const idMensagem = evoData.key?.id || evoData.data?.Info?.ID || `out_mix_txt_${Date.now()}`;
            await connection.execute(`
                INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                VALUES (:id, :cod, :tel, 'OUT', :txt)
            `, {
                id: idMensagem,
                cod: codusur,
                tel: telefone,
                txt: `[Mix/Produto Texto: ${codprod}]\n${text}`
            }, { autoCommit: true });

            return res.json({ success: true, result: evoData });
        }
    } catch (err) {
        console.error('Erro ao enviar produto:', err);
        return res.status(500).json({ success: false, error: 'Erro interno ao enviar produto' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

const { createMontage } = require('../services/imageMontage');

router.post('/send-carousel', async (req, res) => {
    if (!cacheService.isWithinAllowedSchedule()) {
        return res.status(403).json({ success: false, error: 'Fora do horÃ¡rio permitido para envios.' });
    }
    const { codusur, telefone, cards, message } = req.body;
    console.log(`[CHAT] Recebido pedido send-carousel (convertido para Flyer): usr=${codusur}, tel=${telefone}, cards=${cards?.length}`);

    if (!codusur || !telefone || !cards || cards.length === 0) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const configResult = await connection.execute(`
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.CODUSUR = :codusur
        `, { codusur });

        if (configResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'InstÃ¢ncia Evolution nÃ£o configurada.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        let numberToSend = cacheService.getDestinoFinal(formatPhone(telefone));

        // Formata os cards preenchendo os caminhos corretos das imagens (verificando extensÃµes)
        const enrichedCards = cards.map(c => ({
            ...c,
            imagePath: getImagePath(c.codprod)
        }));

        // Gera a imagem encarte com Jimp
        const base64Data = await createMontage(enrichedCards);
        if (!base64Data) {
            return res.status(500).json({ success: false, error: 'Erro ao gerar o encarte' });
        }

        // Envia como media message
        const mimetype = 'image/jpeg';
        const evolutionUrl = `${urlBase}/message/sendMedia/${instance}`; // v1/v2 endpoint compatible in some versions
        
        const bodyPayload = {
            number: numberToSend,
            mediatype: 'image',
            mimetype: mimetype,
            fileName: `encarte_${Date.now()}.jpg`,
            caption: message || '',
            media: base64Data
        };

        const evoRes = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': token,
                'instance': instance
            },
            body: JSON.stringify(bodyPayload)
        });

        let currentEvoRes = evoRes;

        if (evoRes.status === 404) {
            // Fallback for Evolution API V2 strict
            const evolutionUrlV2 = `${urlBase}/send/media`;
            const bodyPayloadV2 = {
                number: numberToSend,
                type: 'image',
                url: base64Data, // Evolution Go V2 aceita url para media string/base64
                caption: message || '',
                fileName: `encarte_${Date.now()}.jpg`,
                mimetype: mimetype
            };
            const evoResV2 = await fetch(evolutionUrlV2, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': token,
                    'instance': instance
                },
                body: JSON.stringify(bodyPayloadV2)
            });
            currentEvoRes = evoResV2;
        }

        const rawText = await currentEvoRes.text();
        console.log(`[CHAT] EvoRes Carousel raw text:`, rawText);
        let evoData = {};
        try {
            evoData = JSON.parse(rawText);
        } catch (e) {
            console.error(`[Evolution API Error Carousel] Nao retornou JSON:`, rawText);
            return res.status(500).json({ success: false, error: 'Evolution API retornou resposta invalida no carrossel.', raw: rawText });
        }

        if (!currentEvoRes.ok) {
             return res.status(400).json({ success: false, error: evoData });
        }

        // Salva no historico
        const idMensagem = evoData.key?.id || evoData.data?.Info?.ID || `out_carousel_${Date.now()}`;
        await connection.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
            VALUES (:id, :cod, :tel, 'OUT', :txt)
        `, {
            id: idMensagem,
            cod: codusur,
            tel: telefone,
            txt: `[Carrossel Enviado]\n${message}`
        }, { autoCommit: true });

        return res.json({ success: true, result: evoData });

    } catch (err) {
        console.error('Erro ao enviar carrossel:', err);
        return res.status(500).json({ success: false, error: 'Erro interno ao enviar carrossel' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/send-media', upload.single('file'), async (req, res) => {
    if (!cacheService.isWithinAllowedSchedule()) {
        return res.status(403).json({ success: false, error: 'Fora do horÃ¡rio permitido para envios.' });
    }
    const { codusur, telefone, caption } = req.body;
    const file = req.file;

    if (!codusur || !telefone || !file) {
        return res.status(400).json({ success: false, error: 'Dados incompletos' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const configResult = await connection.execute(`
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.CODUSUR = :codusur
        `, { codusur });

        if (configResult.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'InstÃ¢ncia Evolution nÃ£o configurada para este vendedor.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (!urlBase || !token || !instance) {
            return res.status(400).json({ success: false, error: 'ConfiguraÃ§Ã£o Evolution incompleta.' });
        }

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);

        let numberToSend = cacheService.getDestinoFinal(formatPhone(telefone));

        const evolutionUrl = `${urlBase}/message/sendMedia/${instance}`; // Endpoint is /message/sendMedia/instanceName or /send/media?

        const base64Data = file.buffer.toString('base64');
        const mimetype = file.mimetype;
        const fileName = file.originalname;
        let mediatype = 'document';
        if (mimetype.startsWith('image/')) mediatype = 'image';
        if (mimetype.startsWith('video/')) mediatype = 'video';
        if (mimetype.startsWith('audio/')) mediatype = 'audio';

        const payload = {
            number: numberToSend,
            mediatype,
            mimetype,
            fileName,
            caption: caption || '',
            media: base64Data
        };

        const randomDelayMs = Math.floor(Math.random() * (15000 - 1000 + 1)) + 1000;
        payload.delay = randomDelayMs;

        console.log(`[DEBUG] Tentando enviar mÃ­dia para: ${evolutionUrl}`);

        const evResponse = await fetch(evolutionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': token
            },
            body: JSON.stringify(payload)
        });

        let evData = {};
        try { evData = await evResponse.json(); } catch(e) {}
        
        if (evResponse.status === 404 || !evResponse.ok || evData.error) {
            // Fallback for v2 Evolution API (GO) format
            console.log(`[DEBUG] Tentativa 1 falhou. Tentando endpoint alternativo /send/media (Evolution v2/GO)`);
            const fallbackUrl = `${urlBase}/send/media`;
            
            let mediaUrlV2 = base64Data || '';
            if (mediaUrlV2.includes('base64,')) {
                mediaUrlV2 = mediaUrlV2.split('base64,')[1];
            }
            if (!mediaUrlV2.startsWith('http://') && !mediaUrlV2.startsWith('https://')) {
                mediaUrlV2 = mediaUrlV2.replace(/\s+/g, '');
            }
            const payloadV2 = {
                number: numberToSend,
                type: mediatype, // 'audio', 'image', 'document', 'video'
                filename: fileName,
                caption: caption || '',
                url: mediaUrlV2
            };
            
            console.log(`[DEBUG] payloadV2 for /send/media:`, JSON.stringify({ ...payloadV2, url: payloadV2.url.substring(0, 50) + '...' }));
            
            const evResponseFallback = await fetch(fallbackUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': token,
                    'instance': instance
                },
                body: JSON.stringify(payloadV2)
            });
            const fallbackText = await evResponseFallback.text();
            let fbData = {};
            try { fbData = JSON.parse(fallbackText); } catch (e) { fbData = { error: fallbackText }; }
            
            if (!evResponseFallback.ok || fbData.error) {
                console.error('Erro na Evolution API (Media):', fallbackText);
                return res.status(500).json({ success: false, error: 'Erro ao enviar mÃ­dia via WhatsApp', details: fallbackText });
            }
            evData = fbData;
        }

        const idMensagem = evData.key?.id || evData.messageId || `out_${Date.now()}`;

        let msgText = `[MÃ­dia Enviada: ${fileName}]` + (caption ? `\n${caption}` : '');
        
        if (mediatype === 'audio' && req.file) {
            msgText = `[AUDIO]`;
            try {
                let groqKey = process.env.GROQ_API_KEY;
                const groqResult = await connection.execute(
                    `SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`
                );
                if (groqResult.rows.length > 0 && groqResult.rows[0][0]) {
                    groqKey = groqResult.rows[0][0];
                }

                if (groqKey && groqKey !== 'SUA_CHAVE_AQUI') {
                    const fs = require('fs');
                    const path = require('path');
                    const uploadsDir = path.join(__dirname, '../../SAC/UPLOAD/Audio');
                    if (!fs.existsSync(uploadsDir)) {
                        fs.mkdirSync(uploadsDir, { recursive: true });
                    }
                    const audioFileName = `${idMensagem}.ogg`;
                    const savedFilePath = path.join(uploadsDir, audioFileName);
                    fs.writeFileSync(savedFilePath, req.file.buffer);

                    msgText = `[AUDIO]${audioFileName}`; // Agora o frontend vai conseguir baixar/tocar

                    const OpenAI = require('openai');
                    const openai = new OpenAI({
                        apiKey: groqKey,
                        baseURL: 'https://api.groq.com/openai/v1',
                    });
                    const transcription = await openai.audio.transcriptions.create({
                        file: fs.createReadStream(savedFilePath),
                        model: 'whisper-large-v3',
                        language: 'pt',
                    });
                    if (transcription && transcription.text) {
                        msgText += `\n\n[TRANSCRICAO] ${transcription.text}`;
                    }
                }
            } catch (tErr) {
                console.error('[CHAT] Erro ao transcrever audio enviado:', tErr.message);
            }
        }

        await connection.execute(`
            INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
            VALUES (:id, :cod, :tel, 'OUT', :txt)
        `, {
            id: idMensagem,
            cod: codusur,
            tel: telefone,
            txt: msgText.substring(0, 4000)
        }, { autoCommit: true });

        res.json({ success: true, message: 'MÃ­dia enviada com sucesso', id_mensagem: idMensagem });
    } catch (err) {
        console.error('Erro ao enviar mÃ­dia:', err);
        res.status(500).json({ success: false, error: 'Erro interno no servidor.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});
const OpenAI = require('openai'); // We use OpenAI library to call Groq (Whisper)

router.post('/transcribe', async (req, res) => {
    const { messageId } = req.body;

    if (!messageId) {
        return res.status(400).json({ success: false, error: 'messageId Ã© obrigatÃ³rio' });
    }

    try {
        const filePath = path.join(__dirname, '../../uploads', `${messageId}.ogg`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Ãudio nÃ£o encontrado no servidor' });
        }

        let apiKey = process.env.GROQ_API_KEY;
        let connection;
        try {
            connection = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });
            const result = await connection.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
            if (result.rows.length > 0 && result.rows[0][0]) {
                apiKey = result.rows[0][0];
            }
        } catch (dbErr) {
            console.error('Erro ao buscar GROQ_API_KEY do banco:', dbErr);
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
        }

        if (!apiKey || apiKey === 'SUA_CHAVE_AQUI') {
            return res.status(400).json({ success: false, error: 'Chave da API de transcriÃ§Ã£o nÃ£o configurada nas ConfiguraÃ§Ãµes (Gerente).' });
        }

        // Configurar a API do Groq (utilizando SDK do OpenAI que Ã© compatÃ­vel)
        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        });

        // Chamada para a API Whisper do Groq
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3', // Modelo disponÃ­vel no Groq
            language: 'pt',
        });

        // Salvar a transcriÃ§Ã£o no banco de dados
        try {
            connection = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });
            await connection.execute(`
                UPDATE CANAL_MENSAGENS 
                SET TEXTO = TEXTO || CHR(10) || CHR(10) || '[TRANSCRICAO] ' || :transcricao 
                WHERE ID_MENSAGEM = :id AND TEXTO NOT LIKE '%[TRANSCRICAO]%'
            `, { transcricao: transcription.text, id: messageId }, { autoCommit: true });
        } catch (dbErr) {
            console.error('Erro ao salvar transcriÃ§Ã£o no banco:', dbErr);
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
        }

        res.json({ success: true, text: transcription.text });
    } catch (err) {
        console.error('Erro na transcriÃ§Ã£o:', err);
        res.status(500).json({ success: false, error: 'Erro ao transcrever Ã¡udio' });
    }
});

module.exports = router;

