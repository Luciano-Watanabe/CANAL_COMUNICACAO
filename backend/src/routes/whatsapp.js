const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const axios = require('axios');

// Busca a instância do usuário logado
async function getInstanceConfig(codusur) {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE T.CODUSUR = :codusur
        `;
        const result = await connection.execute(sql, { codusur }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        if (!row.INSTANCE_NAME || !row.API_TOKEN || !row.URL_BASE) return null;

        let urlBase = row.URL_BASE;
        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        
        console.log(`[DEBUG] getInstanceConfig: codusur=${codusur}, instanceName=${row.INSTANCE_NAME}, urlBase=${urlBase}`);

        return {
            instanceName: row.INSTANCE_NAME,
            apiToken: row.API_TOKEN,
            urlBase
        };
    } catch (e) {
        console.error('Erro ao buscar configs da instância:', e);
        return null;
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) {}
        }
    }
}

router.get('/whatsapp/status', async (req, res) => {
    const { codusur } = req.query;
    if (!codusur) return res.status(400).json({ success: false, error: 'codusur é obrigatório' });

    const config = await getInstanceConfig(codusur);
    if (!config) {
        return res.json({ success: true, state: 'NOT_CONFIGURED', status: 'Instância não configurada.' });
    }

    try {
        // Testa as duas abordagens, V1 (connectionState) e v2 (status com headers)
        // Tentamos V1 primeiro:
        const urlV1 = `${config.urlBase}/instance/connectionState/${config.instanceName}`;
        const responseV1 = await fetch(urlV1, {
            headers: { apikey: config.apiToken }
        });

        let data;
        let finalState = 'DISCONNECTED';
        
        if (responseV1.ok) {
            data = await responseV1.json();
            // Retorna { instance: { state: "open" } }
            if (data?.instance?.state) {
                finalState = data.instance.state; // "open", "close", "connecting"
            } else if (data?.state) {
                finalState = data.state;
            } else if (data?.data) {
                // Evolution Go logic
                if (data.data.Connected && data.data.LoggedIn) {
                    finalState = 'open';
                } else {
                    finalState = 'close';
                }
            }
        } else {
            // Tenta V2/Evolution Go se V1 falhar
            const urlV2 = `${config.urlBase}/instance/status`;
            const responseV2 = await fetch(urlV2, {
                headers: { 
                    apikey: config.apiToken,
                    instance: config.instanceName
                }
            });
            if (responseV2.ok) {
                data = await responseV2.json();
                if (data?.instance?.state) {
                    finalState = data.instance.state;
                } else if (data?.state) {
                    finalState = data.state;
                } else if (data?.data) {
                    if (data.data.Connected && data.data.LoggedIn) {
                        finalState = 'open';
                    } else {
                        finalState = 'close';
                    }
                }
            } else {
                console.error('Status fail', await responseV2.text());
                return res.status(responseV2.status).json({ success: false, state: 'ERROR' });
            }
        }

        res.json({ success: true, state: finalState.toLowerCase(), raw: data });
    } catch (err) {
        console.error('Erro requisição status:', err);
        res.status(500).json({ success: false, state: 'ERROR', error: err.message });
    }
});

router.get('/whatsapp/connect', async (req, res) => {
    const { codusur } = req.query;
    if (!codusur) return res.status(400).json({ success: false, error: 'codusur é obrigatório' });

    const config = await getInstanceConfig(codusur);
    if (!config) {
        return res.status(404).json({ success: false, error: 'Instância não configurada.' });
    }

    try {
        // Para pegar QRCode, na v1 é GET /instance/connect/:instanceName
        const urlV1 = `${config.urlBase}/instance/connect/${config.instanceName}`;
        const responseV1 = await fetch(urlV1, {
            method: 'GET',
            headers: { apikey: config.apiToken }
        });

        if (responseV1.ok) {
            const data = await responseV1.json();
            console.log('[DEBUG] V1 /whatsapp/connect response:', JSON.stringify(data).substring(0, 500));
            let qr = data?.base64 || data?.qrcode?.base64 || data?.qrcode || (typeof data?.code === 'string' && data.code.startsWith('2@') ? data.code : null) || data?.data?.Qrcode;
            if (qr) {
                if (!qr.startsWith('data:image')) {
                    const QRCode = require('qrcode');
                    qr = await QRCode.toDataURL(qr);
                }
                return res.json({ success: true, qr });
            } else {
                return res.json({ success: true, ...data });
            }
        } else {
            // Tenta V2/Evolution Go se V1 falhar
            // No Swagger V2, a rota correta para obter o QR Code é GET /instance/qr
            const qrResp = await fetch(`${config.urlBase}/instance/qr`, {
                method: 'GET',
                headers: { 
                    apikey: config.apiToken,
                    instance: config.instanceName
                }
            });

            let qr = null;
            let data2 = null;

            if (qrResp.ok) {
                const qrData = await qrResp.json();
                console.log('[DEBUG] V2 /instance/qr response:', JSON.stringify(qrData).substring(0, 500));
                qr = qrData?.base64 || qrData?.qrcode?.base64 || qrData?.qrcode || (typeof qrData?.code === 'string' && qrData.code.startsWith('2@') ? qrData.code : null) || qrData?.data?.Qrcode || qrData?.data?.qrcode || qrData?.data?.qrCode;
                data2 = qrData;
            } else {
                console.error(`[DEBUG] qrResp falhou! Status: ${qrResp.status}`);
                try { console.error('[DEBUG] qrResp body:', await qrResp.text()); } catch(e){}

                // Se falhou (ex: 400 ou 404), pode ser que precise disparar o POST /instance/connect primeiro
                const urlV2 = `${config.urlBase}/instance/connect`;
                let responseV2 = await fetch(urlV2, {
                    method: 'POST',
                    headers: { 
                        apikey: config.apiToken,
                        instance: config.instanceName,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                });
                
                console.error(`[DEBUG] responseV2 Status: ${responseV2.status}`);
                let responseV2Text = '';
                try { responseV2Text = await responseV2.text(); console.error('[DEBUG] responseV2 body:', responseV2Text); } catch(e){}

                // Independente de dar erro no connect (pode dar session already logged in), tenta buscar o QR novamente
                const qrRespRetry = await fetch(`${config.urlBase}/instance/qr`, {
                    headers: { apikey: config.apiToken, instance: config.instanceName }
                });

                if (qrRespRetry.ok) {
                    const qrDataRetry = await qrRespRetry.json();
                    qr = qrDataRetry?.base64 || qrDataRetry?.qrcode?.base64 || qrDataRetry?.qrcode || (typeof qrDataRetry?.code === 'string' && qrDataRetry.code.startsWith('2@') ? qrDataRetry.code : null) || qrDataRetry?.data?.Qrcode || qrDataRetry?.data?.qrcode || qrDataRetry?.data?.qrCode;
                    data2 = qrDataRetry;
                } else if (responseV2.ok) {
                    try { data2 = JSON.parse(responseV2Text); } catch(e) {}
                    qr = data2?.base64 || data2?.qrcode?.base64 || data2?.qrcode || (typeof data2?.code === 'string' && data2.code.startsWith('2@') ? data2.code : null) || data2?.data?.Qrcode || data2?.data?.qrcode || data2?.data?.qrCode;
                } else {
                    return res.status(responseV2.status).json({ success: false, error: 'Falha ao buscar qrcode (V2)', details: responseV2Text });
                }
            }

            if (qr) {
                if (!qr.startsWith('data:image')) {
                    const QRCode = require('qrcode');
                    qr = await QRCode.toDataURL(qr);
                }
                return res.json({ success: true, qr });
            }

            return res.json({ success: true, ...data2 });
        }
    } catch (err) {
        console.error(`Erro requisição connect/qrcode (URL: ${config ? config.urlBase : 'desconhecida'}):`, err, err.cause);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/whatsapp/check-number/:numero', async (req, res) => {
    let { numero } = req.params;
    const { codusur } = req.query;
    
    if (!numero || !codusur) {
        return res.status(400).json({ success: false, error: 'numero e codusur são obrigatórios.' });
    }

    numero = String(numero).replace(/[^0-9]/g, '');
    if (numero.length === 10 || numero.length === 11) {
        numero = '55' + numero;
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sqlCache = `
            SELECT TEM_WHATS, DATA_VERIFICACAO 
            FROM CANAL_WHATSAPP_CACHE 
            WHERE TELEFONE = :numero
        `;
        const resultCache = await connection.execute(sqlCache, { numero });
        
        if (resultCache.rows.length > 0) {
            const row = resultCache.rows[0];
            const temWhats = row[0] === 'S';
            const dataVerificacao = row[1];
            
            const diffDays = (new Date() - new Date(dataVerificacao)) / (1000 * 60 * 60 * 24);
            if (diffDays <= 30) {
                return res.json({ success: true, exists: temWhats, source: 'cache', numero });
            }
        }

        const config = await getInstanceConfig(codusur);
        if (!config) {
            return res.status(404).json({ success: false, error: 'Instância do vendedor não configurada.' });
        }

        const url = `${config.urlBase}/chat/whatsappNumbers/${config.instanceName}`;
        let evoResponse;
        
        try {
            evoResponse = await axios.post(url, {
                numbers: [numero]
            }, {
                headers: {
                    'apikey': config.apiToken,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });
        } catch (evoErr) {
            console.error('Erro na chamada Evolution API para whatsappNumbers:', evoErr.message);
            return res.status(500).json({ success: false, error: 'Erro ao consultar a API do WhatsApp.' });
        }

        let exists = false;
        if (Array.isArray(evoResponse.data) && evoResponse.data.length > 0) {
            exists = evoResponse.data[0].exists === true;
        }

        await connection.execute(`
            MERGE INTO CANAL_WHATSAPP_CACHE C
            USING (SELECT :numero AS TELEFONE, :tem_whats AS TEM_WHATS FROM DUAL) D
            ON (C.TELEFONE = D.TELEFONE)
            WHEN MATCHED THEN 
                UPDATE SET C.TEM_WHATS = D.TEM_WHATS, C.DATA_VERIFICACAO = CURRENT_TIMESTAMP
            WHEN NOT MATCHED THEN 
                INSERT (TELEFONE, TEM_WHATS) VALUES (D.TELEFONE, D.TEM_WHATS)
        `, {
            numero: numero,
            tem_whats: exists ? 'S' : 'N'
        }, { autoCommit: true });

        res.json({ success: true, exists, source: 'api', numero });

    } catch (err) {
        console.error('Erro geral no /whatsapp/check-number:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch(e) {}
        }
    }
});

module.exports = router;
