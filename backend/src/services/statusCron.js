const cron = require('node-cron');
const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
const cacheService = require('./cacheService');

// Endpoint base caso a Evolution use algo custom. Caso padrão v1.x:
// POST /message/sendWhatsAppStatus/:instance ou /send/status

async function getTokensAndUrls(connection, vendedoresArray) {
    if (vendedoresArray.includes('TODOS')) {
        const result = await connection.execute(`
            SELECT CODUSUR, INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL
            FROM CANAL_TOKENS_EVOLUTION
        `);
        return result.rows;
    } else {
        // Se for um array específico de códigos (ex: ['1', '5'])
        const placeholders = vendedoresArray.map((_, i) => `:${i}`).join(',');
        const sql = `
            SELECT CODUSUR, INSTANCE_NAME, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL
            FROM CANAL_TOKENS_EVOLUTION
            WHERE CODUSUR IN (${placeholders})
        `;
        const result = await connection.execute(sql, vendedoresArray);
        return result.rows;
    }
}

// Tarefa que roda todo minuto
cron.schedule('* * * * *', async () => {
    if (!cacheService.isWithinAllowedSchedule()) {
        return;
    }
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscar agendamentos pendentes onde DATA_PROGRAMADA <= Agora
        const sql = `
            SELECT ID, ARQUIVO_PATH, LEGENDA, VENDEDORES_DESTINO
            FROM CANAL_AGENDAMENTO_STATUS
            WHERE STATUS_ENVIO = 'PENDENTE'
            AND DATA_PROGRAMADA <= CURRENT_TIMESTAMP
        `;
        const result = await connection.execute(sql);

        for (const row of result.rows) {
            const id = row[0];
            const arquivo = row[1];
            const legenda = row[2];
            const vendedoresDestinoStr = row[3];

            let vendedoresArray = [];
            try {
                if (vendedoresDestinoStr === 'TODOS') {
                    vendedoresArray = ['TODOS'];
                } else {
                    vendedoresArray = JSON.parse(vendedoresDestinoStr);
                }
            } catch (e) {
                vendedoresArray = ['TODOS']; // Fallback
            }

            const tokens = await getTokensAndUrls(connection, vendedoresArray);
            const filePath = path.join(__dirname, '../../uploads', arquivo);

            if (!fs.existsSync(filePath)) {
                await connection.execute(`UPDATE CANAL_AGENDAMENTO_STATUS SET STATUS_ENVIO = 'ERRO (Arquivo nao encontrado)' WHERE ID = :id`, { id }, { autoCommit: true });
                continue;
            }

            // Ler arquivo para base64 ou enviar via Form-Data dependendo da Evolution
            // O endpoint padrão da Evolution para status aceita mediaMessage com number="status@broadcast" 
            // ou tem a rota POST /message/sendWhatsAppStatus/:instance
            const base64Image = fs.readFileSync(filePath).toString('base64');
            const mimeType = 'image/' + path.extname(arquivo).substring(1).replace('jpg', 'jpeg');

            let sucessos = 0;
            let falhas = 0;

            for (const t of tokens) {
                const instance = t[1];
                const token = t[2];
                let url = t[3];
                if (url.endsWith('/')) url = url.slice(0, -1);

                // Em Evolution Go / v2, a rota correta para mídia é /send/media e passa-se a instance no header
                const apiUrl = `${url}/send/media`;

                try {
                    const response = await fetch(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'apikey': token,
                            'instance': instance
                        },
                        body: JSON.stringify({
                            number: cacheService.getDestinoFinal('status@broadcast'),
                            type: 'image',
                            url: base64Image,
                            caption: legenda || ''
                        })
                    });

                    const respData = await response.json().catch(() => null);

                    if (response.ok) {
                        sucessos++;
                    } else {
                        falhas++;
                        console.error(`Falha no envio para ${instance}:`, respData || response.status);
                    }
                } catch (e) {
                    falhas++;
                    console.error(`Erro de conexão ao enviar status para ${instance}:`, e);
                }
            }

            const novoStatus = sucessos > 0 ? 'CONCLUIDO' : 'ERRO (Evolution)';
            await connection.execute(`UPDATE CANAL_AGENDAMENTO_STATUS SET STATUS_ENVIO = :status WHERE ID = :id`, { status: novoStatus, id }, { autoCommit: true });
        }

    } catch (err) {
        console.error('Erro no cron de status:', err);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

console.log('[CRON] Status cron job configurado e rodando.');
