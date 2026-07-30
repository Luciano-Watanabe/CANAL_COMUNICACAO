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

// Buscar histórico de mensagens de um cliente específico com o vendedor logado
router.get('/history', async (req, res) => {
    const { codusur, telefone } = req.query;

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

        // Traz as últimas 50 mensagens
        const sql = `
            SELECT ID_MENSAGEM, SENTIDO, TEXTO, DATA_HORA
            FROM CANAL_MENSAGENS
            WHERE CODUSUR = :codusur AND TELEFONE_CLIENTE = :telefone
            ORDER BY DATA_HORA ASC
        `;
        
        const result = await connection.execute(sql, { codusur, telefone });

        const mensagens = result.rows.map(row => ({
            id: row[0],
            sentido: row[1],
            texto: row[2],
            timestamp: row[3]
        }));

        res.json({ success: true, mensagens });
    } catch (err) {
        console.error('Erro ao buscar histórico:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar estatísticas de conversas (ex: Conversas Hoje)
router.get('/stats', async (req, res) => {
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

// Buscar dados para o gráfico do dashboard
router.get('/chart', async (req, res) => {
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
        console.error('Erro ao buscar dados do gráfico:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});


// Enviar nova mensagem para a Evolution API
router.post('/send', async (req, res) => {
    const { codusur, telefone, texto } = req.body;

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
            return res.status(400).json({ success: false, error: 'Instância Evolution não configurada para este vendedor.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (!urlBase || !token || !instance) {
            return res.status(400).json({ success: false, error: 'Configuração Evolution (URL ou Token) incompleta.' });
        }

        // Garante que a URL não termine com barra
        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);

        // 2. Chamar a API da Evolution para enviar o texto
        
        // Formata o número (DDI + DDD + Numero). Assumindo BR 55 se não houver.
        let numberToSend = formatPhone(telefone);

        const evolutionUrl = `${urlBase}/send/text`;
        
        console.log(`[DEBUG] Tentando enviar para: ${evolutionUrl}`);
        console.log(`[DEBUG] Instância: ${instance}`);
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
            console.error('Resposta não-JSON da Evolution:', rawText);
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
    const { codusur, telefone, codprod, text } = req.body;
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
            return res.status(400).json({ success: false, error: 'Instância Evolution não configurada.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        let numberToSend = formatPhone(telefone);

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
            return res.status(400).json({ success: false, error: 'Instância Evolution não configurada.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        let numberToSend = formatPhone(telefone);

        // Formata os cards preenchendo os caminhos corretos das imagens (verificando extensões)
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
            return res.status(400).json({ success: false, error: 'Instância Evolution não configurada para este vendedor.' });
        }

        const instance = configResult.rows[0][0];
        const token = configResult.rows[0][1];
        let urlBase = configResult.rows[0][2];

        if (!urlBase || !token || !instance) {
            return res.status(400).json({ success: false, error: 'Configuração Evolution incompleta.' });
        }

        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);

        let numberToSend = formatPhone(telefone);

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

        console.log(`[DEBUG] Tentando enviar mídia para: ${evolutionUrl}`);

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
                return res.status(500).json({ success: false, error: 'Erro ao enviar mídia via WhatsApp', details: fallbackText });
            }
            evData = fbData;
        }

        const idMensagem = evData.key?.id || evData.messageId || `out_${Date.now()}`;

        let msgText = `[Mídia Enviada: ${fileName}]` + (caption ? `\n${caption}` : '');
        
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
                    const uploadsDir = path.join(__dirname, '../../uploads');
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

        res.json({ success: true, message: 'Mídia enviada com sucesso', id_mensagem: idMensagem });
    } catch (err) {
        console.error('Erro ao enviar mídia:', err);
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
        return res.status(400).json({ success: false, error: 'messageId é obrigatório' });
    }

    try {
        const filePath = path.join(__dirname, '../../uploads', `${messageId}.ogg`);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Áudio não encontrado no servidor' });
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
            return res.status(400).json({ success: false, error: 'Chave da API de transcrição não configurada nas Configurações (Gerente).' });
        }

        // Configurar a API do Groq (utilizando SDK do OpenAI que é compatível)
        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
        });

        // Chamada para a API Whisper do Groq
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-large-v3', // Modelo disponível no Groq
            language: 'pt',
        });

        // Salvar a transcrição no banco de dados
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
            console.error('Erro ao salvar transcrição no banco:', dbErr);
        } finally {
            if (connection) {
                try { await connection.close(); } catch (e) {}
            }
        }

        res.json({ success: true, text: transcription.text });
    } catch (err) {
        console.error('Erro na transcrição:', err);
        res.status(500).json({ success: false, error: 'Erro ao transcrever áudio' });
    }
});

module.exports = router;
