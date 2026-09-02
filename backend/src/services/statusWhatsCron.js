const cron = require('node-cron');
const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cacheService = require('./cacheService');
const oraclePool = require('./oraclePool');

async function getTokensAndUrls(connection, vendedoresArray) {
    if (vendedoresArray.includes('TODOS')) {
        const result = await connection.execute(`
            SELECT CODUSUR, INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL
            FROM CANAL_TOKENS_EVOLUTION
            WHERE INSTANCE_NAME IS NOT NULL
        `, [], { fetchInfo: { "CODUSUR": { type: oracledb.STRING } } });
        return result.rows;
    } else {
        const placeholders = vendedoresArray.map((_, i) => `:${i} + 1`).join(',');
        const bindVars = {};
        vendedoresArray.forEach((v, i) => { bindVars[`${i + 1}`] = String(v); });
        const sql = `
            SELECT CODUSUR, INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL
            FROM CANAL_TOKENS_EVOLUTION
            WHERE CODUSUR IN (${placeholders})
              AND INSTANCE_NAME IS NOT NULL
        `;
        const result = await connection.execute(sql, bindVars, {
            fetchInfo: { "CODUSUR": { type: oracledb.STRING } }
        });
        return result.rows;
    }
}

function getMimeType(tipo) {
    if (tipo === 'imagem') return 'image/jpeg';
    if (tipo === 'video') return 'video/mp4';
    if (tipo === 'audio') return 'audio/mpeg';
    return 'application/octet-stream';
}

async function enviarMensagemStatus(instance, token, url, payloadV2) {
    if (url.endsWith('/')) url = url.slice(0, -1);

    // V1: POST /message/sendText/{instance} ou /message/sendMedia/{instance}
    // V2 (Evolution Go): POST /send/text ou /send/media
    const isTexto = payloadV2.tipo === 'texto';
    const endpointV1 = isTexto ? `/message/sendText/${instance}` : `/message/sendMedia/${instance}`;
    const endpointV2 = isTexto ? `/send/text` : `/send/media`;

    const headersV1 = { 'apikey': token, 'Content-Type': 'application/json' };
    const headersV2 = { 'apikey': token, 'instance': instance, 'Content-Type': 'application/json' };

    // V1 payload (legacy)
    let payloadV1;
    if (isTexto) {
        payloadV1 = { number: 'status@broadcast', text: payloadV2.text };
    } else {
        const base64Data = fs.readFileSync(payloadV2.filePath).toString('base64');
        payloadV1 = {
            number: 'status@broadcast',
            type: payloadV2.tipo,
            url: base64Data,
            caption: payloadV2.caption || ''
        };
    }

    try {
        const res = await axios.post(`${url}${endpointV1}`, payloadV1, {
            headers: headersV1,
            timeout: 10000
        });
        return { ok: true, data: res.data };
    } catch (errV1) {
        if (errV1.response && errV1.response.status === 404) {
            // Fallback V2
            try {
                let payloadGo;
                if (isTexto) {
                    payloadGo = { number: 'status@broadcast', text: payloadV2.text };
                } else {
                    const base64Data = fs.readFileSync(payloadV2.filePath).toString('base64');
                    payloadGo = {
                        number: 'status@broadcast',
                        type: payloadV2.tipo,
                        url: base64Data,
                        caption: payloadV2.caption || '',
                        mimetype: payloadV2.mimetype
                    };
                }
                const resGo = await axios.post(`${url}${endpointV2}`, payloadGo, {
                    headers: headersV2,
                    timeout: 10000
                });
                return { ok: true, data: resGo.data };
            } catch (errV2) {
                return { ok: false, data: errV2.response ? errV2.response.data : errV2.message };
            }
        }
        return { ok: false, data: errV1.message };
    }
}

let isProcessing = false;

cron.schedule('* * * * *', async () => {
    if (isProcessing) return;

    if (!cacheService.isWithinAllowedSchedule()) {
        return;
    }

    isProcessing = true;
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            SELECT ID, TIPO_MIDIA, ARQUIVO_PATH, LEGENDA, VENDEDORES_DESTINO
            FROM CANAL_STATUS_WHATS
            WHERE STATUS_ENVIO = 'PENDENTE'
              AND DATA_PROGRAMADA <= :agora
        `;

        const result = await connection.execute(sql, { agora: new Date() }, {
            fetchInfo: {
                "VENDEDORES_DESTINO": { type: oracledb.STRING },
                "LEGENDA": { type: oracledb.STRING }
            },
            outFormat: oracledb.OUT_FORMAT_OBJECT
        });

        for (const row of result.rows) {
            const id = row.ID;
            const tipo = row.TIPO_MIDIA;
            const arquivo = row.ARQUIVO_PATH;
            const legenda = row.LEGENDA || '';
            const vendedoresDestinoStr = row.VENDEDORES_DESTINO;

            let vendedoresArray = [];
            try {
                if (vendedoresDestinoStr === 'TODOS') {
                    vendedoresArray = ['TODOS'];
                } else {
                    vendedoresArray = JSON.parse(vendedoresDestinoStr);
                }
            } catch (e) {
                vendedoresArray = ['TODOS'];
            }

            await connection.execute(
                `UPDATE CANAL_STATUS_WHATS SET STATUS_ENVIO = 'PROCESSANDO' WHERE ID = :id`,
                { id },
                { autoCommit: true }
            );

            const tokens = await getTokensAndUrls(connection, vendedoresArray);

            if (tokens.length === 0) {
                await connection.execute(
                    `UPDATE CANAL_STATUS_WHATS SET STATUS_ENVIO = 'ERRO (Sem tokens)', DATA_ENVIO = SYSTIMESTAMP, LOG_ERRO = 'Nenhum vendedor com WhatsApp configurado' WHERE ID = :id`,
                    { id },
                    { autoCommit: true }
                );
                continue;
            }

            let sucessos = 0;
            let falhas = 0;
            const erros = [];

            for (const t of tokens) {
                const instance = t[1];
                const token = t[2];
                let url = t[3];

                let payloadV2;
                if (tipo === 'texto') {
                    payloadV2 = {
                        tipo: 'texto',
                        text: legenda
                    };
                } else {
                    const filePath = path.join(__dirname, '../../uploads', arquivo);
                    if (!fs.existsSync(filePath)) {
                        erros.push(`Arquivo não encontrado: ${arquivo}`);
                        falhas++;
                        continue;
                    }
                    payloadV2 = {
                        tipo: tipo,
                        filePath: filePath,
                        caption: legenda,
                        mimetype: getMimeType(tipo)
                    };
                }

                const resultEnvio = await enviarMensagemStatus(instance, token, url, payloadV2);

                if (resultEnvio.ok) {
                    sucessos++;
                } else {
                    falhas++;
                    erros.push(`Instância ${instance}: ${JSON.stringify(resultEnvio.data).substring(0, 500)}`);
                }

                await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
            }

            const novoStatus = sucessos > 0 ? 'ENVIADO' : 'ERRO';
            const logErro = erros.length > 0 ? erros.join(' | ') : null;

            await connection.execute(
                `UPDATE CANAL_STATUS_WHATS SET STATUS_ENVIO = :status, DATA_ENVIO = SYSTIMESTAMP, LOG_ERRO = :log_erro WHERE ID = :id`,
                { status: novoStatus, log_erro: logErro, id },
                { autoCommit: true }
            );

            console.log(`[CRON-STATUS] ID ${id}: ${sucessos} sucessos, ${falhas} falhas`);
        }

    } catch (err) {
        console.error('Erro no cron de status-whats:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
        isProcessing = false;
    }
});

console.log('[CRON] Status Whats cron job configurado e rodando.');

module.exports = {
    getTokensAndUrls,
    enviarMensagemStatus
};
