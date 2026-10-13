const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const cacheService = require('../services/cacheService');

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
              AND DATA_HORA >= SYSDATE - 3
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
            WITH RawMsgs AS (
                SELECT
                  C.DATA_RECEBIMENTO,
                  JSON_VALUE(C.CONTEUDO, '$.instanceId') AS INSTANCEID,
                  JSON_VALUE(C.CONTEUDO, '$.instanceName') AS INSTANCENAME,
                  COALESCE(
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.conversation'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.extendedTextMessage.text'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.imageMessage.caption'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.videoMessage.caption'),
                      '[Mídia/Documento]'
                  ) AS TEXTO_MENSAGEM,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.PushName') AS PUSHNAME,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.IsFromMe' RETURNING VARCHAR2(5)) AS IS_FROM_ME,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.Chat') AS CHAT_JID,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.Sender') AS SENDER_JID,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.RecipientAlt') AS RECIPIENT_ALT
                FROM CANAL_WEBHOOK C
                WHERE C.DATA_RECEBIMENTO >= SYSDATE - 30
                  AND JSON_VALUE(C.CONTEUDO, '$.data.Info.Chat') IS NOT NULL
            ),
            ProcessedMsgs AS (
                SELECT 
                    DATA_RECEBIMENTO,
                    INSTANCEID,
                    INSTANCENAME,
                    TEXTO_MENSAGEM,
                    PUSHNAME,
                    IS_FROM_ME,
                    CASE 
                        WHEN IS_FROM_ME = 'true' THEN COALESCE(RECIPIENT_ALT, CHAT_JID)
                        ELSE CHAT_JID
                    END AS QUEM_RECEBEU
                FROM RawMsgs
            )
            SELECT 
                REPLACE(QUEM_RECEBEU, '@s.whatsapp.net', '') AS TELEFONE_CLIENTE,
                INSTANCENAME AS CODUSUR,
                INSTANCENAME AS NOME_CONTA,
                INSTANCENAME AS INSTANCE_NAME,
                MAX(DATA_RECEBIMENTO) AS ULTIMA_MENSAGEM,
                COUNT(*) AS QT_MENSAGENS,
                MAX(TEXTO_MENSAGEM) KEEP (DENSE_RANK LAST ORDER BY DATA_RECEBIMENTO) AS PREVIEW,
                NULL AS ULTIMO_MEDIA_TYPE,
                MAX(PUSHNAME) AS NOME_WHATSAPP,
                0 AS QT_NAO_LIDAS
            FROM ProcessedMsgs
            GROUP BY INSTANCENAME, QUEM_RECEBEU
            ORDER BY ULTIMA_MENSAGEM DESC
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
                mediaType: mediaType || null,
                qtNaoLidas: row[9] || 0
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
            WITH RawMsgs AS (
                SELECT
                  C.DATA_RECEBIMENTO,
                  JSON_VALUE(C.CONTEUDO, '$.instanceName') AS INSTANCENAME,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.ID') AS ID_MENSAGEM,
                  COALESCE(
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.conversation'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.extendedTextMessage.text'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.imageMessage.caption'),
                      JSON_VALUE(C.CONTEUDO, '$.data.Message.videoMessage.caption'),
                      '[Mídia/Documento]'
                  ) AS TEXTO,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.IsFromMe' RETURNING VARCHAR2(5)) AS IS_FROM_ME,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.Chat') AS CHAT_JID,
                  JSON_VALUE(C.CONTEUDO, '$.data.Info.RecipientAlt') AS RECIPIENT_ALT
                FROM CANAL_WEBHOOK C
                WHERE C.DATA_RECEBIMENTO >= SYSDATE - 30
                  AND JSON_VALUE(C.CONTEUDO, '$.instanceName') = :codusur
            ),
            ProcessedMsgs AS (
                SELECT 
                    DATA_RECEBIMENTO AS DATA_HORA,
                    ID_MENSAGEM,
                    TEXTO,
                    CASE WHEN IS_FROM_ME = 'true' THEN 'OUT' ELSE 'IN' END AS SENTIDO,
                    REPLACE(
                        CASE WHEN IS_FROM_ME = 'true' THEN COALESCE(RECIPIENT_ALT, CHAT_JID) ELSE CHAT_JID END,
                        '@s.whatsapp.net', ''
                    ) AS QUEM_RECEBEU
                FROM RawMsgs
            )
            SELECT ID_MENSAGEM, SENTIDO, TEXTO, DATA_HORA, NULL AS MEDIA_URL, NULL AS MEDIA_TYPE, NULL AS MEDIA_MIMETYPE
            FROM ProcessedMsgs
            WHERE QUEM_RECEBEU = :telefone
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

// Retornar a quantidade total de mensagens não lidas para o usuário logado
router.get('/unread-count', async (req, res) => {
    const { codusur } = req.query;
    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur é obrigatório' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT SUM(CASE WHEN SENTIDO = 'IN' AND NVL(LIDA, 'N') = 'N' THEN 1 ELSE 0 END) AS TOTAL_NAO_LIDAS
            FROM CANAL_MENSAGENS
            WHERE CODUSUR = :codusur
        `;
        const result = await connection.execute(sql, { codusur });
        const unreadCount = result.rows && result.rows[0] ? (result.rows[0][0] || 0) : 0;

        res.json({ success: true, unreadCount });
    } catch (err) {
        console.error('Erro ao buscar unread-count:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Retorna os dados resumidos (status) de conversas para a lista do Chat
router.get('/status-conversas', async (req, res) => {
    const { codusur } = req.query;
    if (!codusur) return res.status(400).json({ success: false, error: 'codusur é obrigatório' });

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT TELEFONE_CLIENTE, 
                   MAX(DATA_HORA) as ULTIMA_MENSAGEM, 
                   SUM(CASE WHEN SENTIDO = 'IN' AND NVL(LIDA, 'N') = 'N' THEN 1 ELSE 0 END) as QT_NAO_LIDAS 
            FROM CANAL_MENSAGENS 
            WHERE CODUSUR = :codusur AND DATA_HORA >= SYSDATE - 3
            GROUP BY TELEFONE_CLIENTE
        `;
        const result = await connection.execute(sql, { codusur });
        
        const conversas = result.rows.map(r => ({
            telefone: r[0],
            ultimaMensagem: r[1],
            qtNaoLidas: r[2] || 0
        }));

        res.json({ success: true, conversas });
    } catch (err) {
        console.error('Erro ao buscar status-conversas:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Marcar mensagens de uma conversa como lidas
router.post('/marcar-lida', async (req, res) => {
    const { codusur, telefone } = req.body;

    if (!codusur || !telefone) {
        return res.status(400).json({ success: false, error: 'codusur e telefone são obrigatórios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            UPDATE CANAL_MENSAGENS
            SET LIDA = 'S'
            WHERE CODUSUR = :codusur
              AND TELEFONE_CLIENTE = :telefone
              AND SENTIDO = 'IN'
              AND NVL(LIDA, 'N') = 'N'
        `;
        
        const result = await connection.execute(sql, { codusur, telefone }, { autoCommit: true });

        res.json({ success: true, rowsAffected: result.rowsAffected });
    } catch (err) {
        console.error('Erro ao marcar mensagens como lidas:', err);
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

// Endpoint para gravar Pedido / Orçamento Força de Vendas (PCPEDCFV e PCPEDIFV) a partir do Chat
// Suporta a escolha de tipo: 'ORCAMENTO' ou 'CARRINHO'
router.post('/pedido-fv', async (req, res) => {
    const {
        tipo,              // 'ORCAMENTO' ou 'CARRINHO'
        codcli,            // Código do cliente (PCCLIENT.CODCLI)
        codusur,           // Código do RCA (se omitido, busca da PCCLIENT)
        codcob,            // Código de cobrança (opcional)
        codplpag,          // Código do plano de pagamento (opcional)
        codfilial,         // Filial (opcional)
        codfilialnf,       // Filial NF (opcional)
        codfilialretira,   // Filial Retira (opcional)
        condvenda,         // Condição de venda (default 1)
        vlfrete,           // Frete (default 0)
        obs1,              // Observação 1
        obs2,              // Observação 2
        obsEntrega,        // Observação de entrega (OBSENTREGA1)
        importarImediato,  // Se true (default), dispara AGDIST.INTEGRADORA.IMPORTARPEDIDO
        itens              // Array de itens: [{ codprod, qt/qtd, pvenda/preco, percdescedi/perc, bonific, ean/codauxiliar, unidade }]
    } = req.body;

    if (!codcli) {
        return res.status(400).json({ success: false, error: 'Código do cliente (codcli) é obrigatório.' });
    }

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ success: false, error: 'Lista de itens é obrigatória e deve conter ao menos um produto.' });
    }

    const tipoNormalizado = String(tipo || 'CARRINHO').trim().toUpperCase();
    const isOrcamento = tipoNormalizado === 'ORCAMENTO';

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // 1. Buscar dados do cliente
        const sqlClient = `
            SELECT CGCENT, CODUSUR1, CODCOB, CODPLPAG, CODFILIALNF, CLIENTE, BLOQUEIO
            FROM PCCLIENT
            WHERE CODCLI = :codcli
        `;
        const resClient = await connection.execute(sqlClient, { codcli: Number(codcli) });
        if (!resClient.rows || resClient.rows.length === 0) {
            return res.status(404).json({ success: false, error: `Cliente ${codcli} não encontrado no ERP.` });
        }

        const [cgccliRaw, cliCodusur, cliCodcob, cliCodplpag, cliFilialNf, cliNome, cliBloqueio] = resClient.rows[0];
        const cgccli = String(cgccliRaw || '').trim();
        const activeCodusur = Number(codusur || cliCodusur);
        if (!activeCodusur) {
            return res.status(400).json({ success: false, error: 'Vendedor (codusur) não informado e não vinculado ao cliente.' });
        }

        const activeCodcob = String(codcob || cliCodcob || '237').trim();
        const activeCodplpag = Number(codplpag || cliCodplpag || 1);
        const activeCondvenda = Number(condvenda || 1);
        const activeCodfilial = String(codfilial || cliFilialNf || process.env.ESTOQUE_CODFILIAL || '1').trim();
        const activeCodfilialnf = String(codfilialnf || cliFilialNf || activeCodfilial).trim();
        const activeCodfilialretira = String(codfilialretira || activeCodfilial).trim();
        const activeVlfrete = Number(vlfrete || 0);

        // 2. Obter e reservar NUMPEDRCA na PCUSUARI
        let numpedrca;
        const sqlSeqUsur = `
            SELECT PROXNUMPEDFORCA, PROXNUMPEDWEB
            FROM PCUSUARI
            WHERE CODUSUR = :codusur
            FOR UPDATE
        `;
        const resSeqUsur = await connection.execute(sqlSeqUsur, { codusur: activeCodusur });
        if (resSeqUsur.rows && resSeqUsur.rows.length > 0) {
            const [proxForca, proxWeb] = resSeqUsur.rows[0];
            if (proxForca && Number(proxForca) > 0) {
                numpedrca = Number(proxForca);
                await connection.execute(`
                    UPDATE PCUSUARI
                    SET PROXNUMPEDFORCA = :nextnum
                    WHERE CODUSUR = :codusur
                `, { nextnum: numpedrca + 1, codusur: activeCodusur });
            } else if (proxWeb && Number(proxWeb) > 0) {
                numpedrca = Number(proxWeb);
                await connection.execute(`
                    UPDATE PCUSUARI
                    SET PROXNUMPEDWEB = :nextnum
                    WHERE CODUSUR = :codusur
                `, { nextnum: numpedrca + 1, codusur: activeCodusur });
            }
        }

        if (!numpedrca) {
            numpedrca = (activeCodusur * 100000000) + 1;
        }

        // Garantir unicidade na PCPEDCFV
        const sqlCheckDup = `
            SELECT NVL(MAX(NUMPEDRCA), :numpedrca)
            FROM PCPEDCFV
            WHERE CODUSUR = :codusur AND NUMPEDRCA >= :numpedrca
        `;
        const resDup = await connection.execute(sqlCheckDup, { codusur: activeCodusur, numpedrca });
        if (resDup.rows && resDup.rows.length > 0 && resDup.rows[0][0] >= numpedrca) {
            numpedrca = Number(resDup.rows[0][0]) + 1;
        }

        // 3. Obter data/hora sincronizada do banco
        const resSysdate = await connection.execute(`SELECT SYSDATE FROM DUAL`);
        const dtAbertura = resSysdate.rows[0][0];
        const dtFechamento = dtAbertura;

        // 4. Inserir Cabeçalho na PCPEDCFV
        const flagOrcamento = isOrcamento ? 'S' : 'N';
        const defaultObs1 = isOrcamento ? 'Orçamento via Chat' : 'Pedido de Venda via Chat';
        const finalObs1 = String(obs1 || defaultObs1).substring(0, 50);
        const finalObs2 = obs2 ? String(obs2).substring(0, 50) : null;
        const finalObsEntrega = obsEntrega ? String(obsEntrega).substring(0, 75) : null;

        const sqlInsertCabFV = `
            INSERT INTO PCPEDCFV (
                IMPORTADO,
                NUMPEDRCA,
                CODUSUR,
                CGCCLI,
                CODCLI,
                DTABERTURAPEDPALM,
                DTFECHAMENTOPEDPALM,
                CODFILIAL,
                CODFILIALNF,
                CODFILIALRETIRA,
                CODCOB,
                CODPLPAG,
                CONDVENDA,
                ORIGEMPED,
                TIPOFV,
                ORCAMENTO,
                OBS1,
                OBS2,
                OBSENTREGA1,
                VLFRETE,
                ENVIADONV
            ) VALUES (
                1,
                :numpedrca,
                :codusur,
                :cgccli,
                :codcli,
                :dtabertura,
                :dtfechamento,
                :codfilial,
                :codfilialnf,
                :codfilialretira,
                :codcob,
                :codplpag,
                :condvenda,
                'F',
                'FV',
                :orcamento,
                :obs1,
                :obs2,
                :obsentrega1,
                :vlfrete,
                'N'
            )
        `;

        await connection.execute(sqlInsertCabFV, {
            numpedrca,
            codusur: activeCodusur,
            cgccli,
            codcli: Number(codcli),
            dtabertura: dtAbertura,
            dtfechamento: dtFechamento,
            codfilial: activeCodfilial,
            codfilialnf: activeCodfilialnf,
            codfilialretira: activeCodfilialretira,
            codcob: activeCodcob,
            codplpag: activeCodplpag,
            condvenda: activeCondvenda,
            orcamento: flagOrcamento,
            obs1: finalObs1,
            obs2: finalObs2,
            obsentrega1: finalObsEntrega,
            vlfrete: activeVlfrete
        });

        // 5. Inserir Itens na PCPEDIFV
        let seq = 1;
        let valorTotal = 0;

        for (const item of itens) {
            const codprod = Number(item.codprod);
            const qt = Number(item.qt || item.qtd || 1);
            const pvenda = Number(item.pvenda || item.preco || 0);
            const percdescedi = Number(item.percdescedi || item.perc || 0);
            const bonific = String(item.bonific || 'N').trim().toUpperCase() === 'S' ? 'S' : null;
            const unidade = item.unidade ? String(item.unidade).substring(0, 2) : null;
            
            valorTotal += (qt * pvenda);

            // Obter CODAUXILIAR (código de barras) se não enviado
            let codauxiliar = item.ean || item.codauxiliar || null;
            if (!codauxiliar) {
                const resAux = await connection.execute(
                    `SELECT CODAUXILIAR FROM PCPRODUT WHERE CODPROD = :codprod`,
                    { codprod }
                );
                if (resAux.rows && resAux.rows.length > 0) {
                    codauxiliar = resAux.rows[0][0];
                }
            }

            const sqlInsertItemFV = `
                INSERT INTO PCPEDIFV (
                    NUMPEDRCA,
                    CODUSUR,
                    CGCCLI,
                    DTABERTURAPEDPALM,
                    NUMSEQ,
                    CODPROD,
                    QT,
                    PVENDA,
                    CODFILIALRETIRA,
                    CODAUXILIAR,
                    BONIFIC,
                    PERCDESCEDI,
                    UNIDADE_FRIOS
                ) VALUES (
                    :numpedrca,
                    :codusur,
                    :cgccli,
                    :dtabertura,
                    :numseq,
                    :codprod,
                    :qt,
                    :pvenda,
                    :codfilialretira,
                    :codauxiliar,
                    :bonific,
                    :percdescedi,
                    :unidade
                )
            `;

            await connection.execute(sqlInsertItemFV, {
                numpedrca,
                codusur: activeCodusur,
                cgccli,
                dtabertura: dtAbertura,
                numseq: seq * 2, // padrão WinThor par (2, 4, 6...)
                codprod,
                qt,
                pvenda,
                codfilialretira: activeCodfilialretira,
                codauxiliar: codauxiliar ? Number(codauxiliar) : null,
                bonific,
                percdescedi,
                unidade
            });

            seq++;
        }

        // Se for orçamento, espelhar também em CANAL_ORCAC / CANAL_ORCAI para histórico interno
        if (isOrcamento) {
            try {
                await connection.execute(`
                    INSERT INTO CANAL_ORCAC (
                        NUMPEDRCA, CODUSUR, CODCLI, CGCCLI, DTABERTURAPEDPALM, DTFECHAMENTOPEDPALM,
                        CODFILIAL, CODCOB, CODPLPAG, CONDVENDA, OBS1, VLFRETE, ORIGEMPED, STATUS_INTEGRACAO, DTINCLUSAO
                    ) VALUES (
                        :numpedrca, :codusur, :codcli, :cgccli, :dtabertura, :dtfechamento,
                        :codfilial, :codcob, :codplpag, :condvenda, :obs1, :vlfrete, 'F', 'PENDENTE', SYSDATE
                    )
                `, {
                    numpedrca,
                    codusur: activeCodusur,
                    codcli: Number(codcli),
                    cgccli,
                    dtabertura: dtAbertura,
                    dtfechamento: dtFechamento,
                    codfilial: activeCodfilial,
                    codcob: activeCodcob,
                    codplpag: activeCodplpag,
                    condvenda: activeCondvenda,
                    obs1: finalObs1,
                    vlfrete: activeVlfrete
                });

                let orcSeq = 1;
                for (const item of itens) {
                    await connection.execute(`
                        INSERT INTO CANAL_ORCAI (
                            NUMPEDRCA, NUMSEQ, CODUSUR, CGCCLI, DTABERTURAPEDPALM, CODPROD, QT, PVENDA, DTINCLUSAO
                        ) VALUES (
                            :numpedrca, :numseq, :codusur, :cgccli, :dtabertura, :codprod, :qt, :pvenda, SYSDATE
                        )
                    `, {
                        numpedrca,
                        numseq: orcSeq,
                        codusur: activeCodusur,
                        cgccli,
                        dtabertura: dtAbertura,
                        codprod: Number(item.codprod),
                        qt: Number(item.qt || item.qtd || 1),
                        pvenda: Number(item.pvenda || item.preco || 0)
                    });
                    orcSeq++;
                }
            } catch (errOrcLocal) {
                console.warn('Aviso ao gravar em CANAL_ORCAC:', errOrcLocal.message);
            }
        }

        // Commit da inserção nas tabelas de Força de Vendas
        await connection.commit();

        let resultadoImportacao = {
            executado: false,
            importado: 1, // 1 = Gravado na PCPEDCFV / Aguardando integradora
            numped: null,
            posicao: null,
            retorno: null,
            observacaoPc: null,
            logs: []
        };

        // 6. Importação Imediata para o ERP (se habilitada, default = true)
        const deveImportar = importarImediato !== false;
        if (deveImportar) {
            try {
                // Executar procedure oficial da integradora WinThor
                await connection.execute(`
                    BEGIN
                        AGDIST.INTEGRADORA.IMPORTARPEDIDO(
                            p_tipoleitura => 1,
                            p_datainicial => TRUNC(SYSDATE),
                            p_datafinal   => TRUNC(SYSDATE),
                            p_codfilial   => '99',
                            p_tiporeg     => NULL,
                            p_codusur     => :codusur,
                            p_numpedrca   => :numpedrca
                        );
                    END;
                `, {
                    codusur: activeCodusur,
                    numpedrca
                });

                resultadoImportacao.executado = true;

                // Consultar resultado na PCPEDCFV
                const sqlVerif = `
                    SELECT IMPORTADO, NUMPED, POSICAO_ATUAL, RETORNO, OBSERVACAO_PC
                    FROM PCPEDCFV
                    WHERE NUMPEDRCA = :numpedrca
                      AND CODUSUR = :codusur
                      AND CGCCLI = :cgccli
                      AND DTABERTURAPEDPALM = :dtabertura
                `;
                const resVerif = await connection.execute(sqlVerif, {
                    numpedrca,
                    codusur: activeCodusur,
                    cgccli,
                    dtabertura: dtAbertura
                });

                if (resVerif.rows && resVerif.rows.length > 0) {
                    const [vImportado, vNumped, vPosicao, vRetorno, vObsPc] = resVerif.rows[0];
                    resultadoImportacao.importado = vImportado;
                    resultadoImportacao.numped = vNumped;
                    resultadoImportacao.posicao = vPosicao;
                    resultadoImportacao.retorno = vRetorno;
                    resultadoImportacao.observacaoPc = vObsPc;
                }

                // Consultar mensagens geradas na PCLOG_INTEGRADORA
                const sqlLogs = `
                    SELECT MSG, TO_CHAR(DATA, 'DD/MM/YYYY HH24:MI:SS') AS DATA_LOG, PVENDA, PTABELA, PBASE
                    FROM PCLOG_INTEGRADORA
                    WHERE NUMPEDRCA = :numpedrca
                      AND CODUSUR = :codusur
                      AND CGCCLI = :cgccli
                      AND DTABERTURAPEDPALM = :dtabertura
                    ORDER BY SEQ ASC
                `;
                const resLogs = await connection.execute(sqlLogs, {
                    numpedrca,
                    codusur: activeCodusur,
                    cgccli,
                    dtabertura: dtAbertura
                });

                if (resLogs.rows) {
                    resultadoImportacao.logs = resLogs.rows.map(r => ({
                        msg: r[0],
                        data: r[1],
                        pvenda: r[2],
                        ptabela: r[3],
                        pbase: r[4]
                    }));
                }

            } catch (errInteg) {
                console.error('Erro na execução imediata da INTEGRADORA.IMPORTARPEDIDO:', errInteg);
                resultadoImportacao.erroIntegracao = errInteg.message;
            }
        }

        res.json({
            success: true,
            tipo: isOrcamento ? 'ORCAMENTO' : 'CARRINHO',
            numpedrca,
            codcli: Number(codcli),
            cliente: cliNome,
            codusur: activeCodusur,
            totalItens: itens.length,
            valorTotal: Number(valorTotal.toFixed(2)),
            resultadoImportacao
        });

    } catch (err) {
        console.error('Erro ao gravar pedido/orçamento FV:', err);
        if (connection) {
            try { await connection.rollback(); } catch (e) {}
        }
        res.status(500).json({
            success: false,
            error: 'Erro interno ao gravar pedido/orçamento no ERP: ' + err.message
        });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

