const cron = require('node-cron');
const oracledb = require('oracledb');
const fetch = require('node-fetch');
const cacheService = require('./cacheService');

// Array global para embaralhar os delays
let delayQueue = [];

function getNextDelay() {
    if (delayQueue.length === 0) {
        delayQueue = Array.from({length: 60}, (_, i) => i + 1);
        for (let i = delayQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [delayQueue[i], delayQueue[j]] = [delayQueue[j], delayQueue[i]];
        }
    }
    return delayQueue.pop();
}

async function enviarMensagemEvolution(botGestor, telefone, texto) {
    if (!telefone) return;
    try {
        let p = String(telefone).replace(/[^0-9]/g, '');
        p = p.replace(/^0+/, '');
        if (p.length === 10 || p.length === 11) {
            p = '55' + p;
        }
        if (!p.startsWith('55')) {
            p = '55' + p;
        }

        p = cacheService.getDestinoFinal(p);

        const url = `${botGestor.URL_BASE}/message/sendText/${botGestor.INSTANCE_NAME}`;
        
        const delaySegundos = getNextDelay();
        console.log(`[VISITAS CRON] Aguardando delay de ${delaySegundos}s para o vendedor ${p}...`);
        await new Promise(r => setTimeout(r, delaySegundos * 1000));
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': botGestor.API_TOKEN
            },
            body: JSON.stringify({
                number: p,
                text: texto
            })
        });
        
        if (!response.ok) {
            console.error(`[VISITAS CRON] Erro na API do Evolution para ${p}: ${response.statusText}`);
        }
    } catch (e) {
        console.error(`[VISITAS CRON] Erro de rede ao enviar para ${telefone}:`, e.message);
    }
}

// Roda a cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
    console.log('[VISITAS CRON] Verificando visitas agendadas para sinalizar os vendedores...');
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscando BOT_GESTOR Token e codusur
        const sqlBot = `
            SELECT U.CODUSUR, T.API_TOKEN, T.INSTANCE_NAME, COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM PCUSUARI U
            JOIN CANAL_TOKENS_EVOLUTION T ON U.CODUSUR = T.CODUSUR
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE U.NOME LIKE '%BOT%' OR U.USURFTP = 'BOT_GESTOR'
            FETCH FIRST 1 ROWS ONLY
        `;
        const botResult = await connection.execute(sqlBot, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (botResult.rows.length === 0) {
            console.log('[VISITAS CRON] AVISO: BOT_GESTOR não configurado em CANAL_TOKENS_EVOLUTION. Cancelando envios.');
            return;
        }
        const botGestor = botResult.rows[0];

        // Buscar visitas pendentes nas próximas 1 hora e até 1 hora no passado
        const sqlVisitas = `
            SELECT V.ID, C.CLIENTE, U.NOME AS NOME_VENDEDOR, V.DATA_AGENDADA, NVL(U.TELEFONE1, U.TELEFONE2) AS TELEFONE_VENDEDOR
            FROM CANAL_VISITAS V
            JOIN PCCLIENT C ON V.CODCLI = C.CODCLI
            JOIN PCUSUARI U ON V.CODUSUR = U.CODUSUR
            WHERE V.STATUS = 'PENDENTE'
              AND V.SINALIZADO_VENDEDOR = 'N'
              AND V.DATA_AGENDADA BETWEEN (SYSDATE - 1/24) AND (SYSDATE + 1/24)
              AND NVL(U.TELEFONE1, U.TELEFONE2) IS NOT NULL
        `;
        const resultVisitas = await connection.execute(sqlVisitas, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (!resultVisitas.rows || resultVisitas.rows.length === 0) {
            return;
        }

        console.log(`[VISITAS CRON] Encontradas ${resultVisitas.rows.length} visitas para alertar os vendedores. Processando...`);

        for (const visita of resultVisitas.rows) {
            try {
                // Formatar hora para exibir na mensagem (HH:mm)
                const d = new Date(visita.DATA_AGENDADA);
                const horaStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                const mensagemTexto = `Olá *${visita.NOME_VENDEDOR}*!\n\nLembrete: você tem uma visita agendada ao cliente *${visita.CLIENTE}* hoje às *${horaStr}*.\n\nApós a visita, por favor, responda a esta mensagem com a hashtag *#retorno* seguida do seu feedback.\n\nExemplo:\n*#retorno* A visita foi excelente, o cliente fez pedido.`;

                await enviarMensagemEvolution(botGestor, visita.TELEFONE_VENDEDOR, mensagemTexto);

                // Marcar como sinalizado
                await connection.execute(`
                    UPDATE CANAL_VISITAS 
                    SET SINALIZADO_VENDEDOR = 'S' 
                    WHERE ID = :id
                `, { id: visita.ID }, { autoCommit: true });
                
                console.log(`[VISITAS CRON] Vendedor ${visita.NOME_VENDEDOR} sinalizado para a visita ${visita.ID}`);
            } catch (err) {
                console.error(`[VISITAS CRON] Erro ao sinalizar visita ${visita.ID}:`, err);
            }
        }

    } catch (error) {
        console.error('[VISITAS CRON] Erro geral:', error);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});
