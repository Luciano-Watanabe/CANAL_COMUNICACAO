const cron = require('node-cron');
const oracledb = require('oracledb');
const fetch = require('node-fetch'); // ou axios

// Array global para embaralhar os delays
let delayQueue = [];

function getNextDelay() {
    if (delayQueue.length === 0) {
        // Preencher de 1 a 900
        delayQueue = Array.from({length: 900}, (_, i) => i + 1);
        // Embaralhar
        for (let i = delayQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [delayQueue[i], delayQueue[j]] = [delayQueue[j], delayQueue[i]];
        }
    }
    return delayQueue.pop(); // Remove e retorna o último elemento
}

// Roda todo dia as 08:00
cron.schedule('0 8 * * *', async () => {
    console.log('[AUTOMAÇÕES CRON] Iniciando verificação diária de automações às 08:00...');
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Buscar automações ativas
        const sqlAutomacoes = `SELECT * FROM CANAL_MENSAGENS_AUT_CONFIG WHERE ATIVO = 'S'`;
        const resultAutomacoes = await connection.execute(sqlAutomacoes, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (!resultAutomacoes.rows || resultAutomacoes.rows.length === 0) {
            console.log('[AUTOMAÇÕES CRON] Nenhuma automação ativa encontrada.');
            return;
        }

        console.log(`[AUTOMAÇÕES CRON] Encontradas ${resultAutomacoes.rows.length} regras ativas. Processando...`);

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
            console.log('[AUTOMAÇÕES CRON] AVISO: BOT_GESTOR não configurado em CANAL_TOKENS_EVOLUTION. Cancelando envios.');
            return;
        }
        const botGestor = botResult.rows[0];

        // Auxiliares de processamento para cada regra
        for (const regra of resultAutomacoes.rows) {
            try {
                if (regra.TIPO_REGRA === 'SEM_VENDA') {
                    await processarSemVenda(connection, regra, botGestor);
                } else if (regra.TIPO_REGRA === 'PERIODO_PROXIMO') {
                    await processarPeriodoProximo(connection, regra, botGestor);
                } else if (regra.TIPO_REGRA === 'VISITA') {
                    await processarVisitas(connection, regra, botGestor);
                } else if (regra.TIPO_REGRA === 'DIA_ESPECIFICO') {
                    await processarDiasEspecificos(connection, regra, botGestor);
                }
            } catch (err) {
                console.error(`[AUTOMAÇÕES CRON] Erro ao processar regra ${regra.TIPO_REGRA}:`, err);
            }
        }

    } catch (error) {
        console.error('[AUTOMAÇÕES CRON] Erro geral:', error);
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

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

        const url = `${botGestor.URL_BASE}/message/sendText/${botGestor.INSTANCE_NAME}`;
        
        // Pega o próximo delay aleatório sem repetir (entre 1s e 900s)
        const delaySegundos = getNextDelay();
        console.log(`[AUTOMAÇÕES CRON] Aguardando delay de ${delaySegundos}s para ${p}...`);
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
            console.error(`[AUTOMAÇÕES CRON] Erro na API do Evolution para ${p}: ${response.statusText}`);
        }
    } catch (e) {
        console.error(`[AUTOMAÇÕES CRON] Erro de rede ao enviar para ${telefone}:`, e.message);
    }
}

function renderTemplate(template, clientData) {
    return template
        .replace(/{{nome_cliente}}/g, clientData.CLIENTE || 'Cliente')
        .replace(/{{dias_sem_comprar}}/g, clientData.DIAS_SEM_COMPRAR || '')
        .replace(/{{vendedor}}/g, clientData.NOME_VENDEDOR || '');
}

// ======================= REGRAS =======================

async function processarSemVenda(connection, regra, botGestor) {
    const dias = regra.DIAS_GATILHO;
    if (!dias) return;

    const sql = `
        SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
               TRUNC(SYSDATE) - TRUNC(C.DTULTCOMP) AS DIAS_SEM_COMPRAR
        FROM PCCLIENT C
        JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
        WHERE C.DTULTCOMP IS NOT NULL
          AND TRUNC(SYSDATE) - TRUNC(C.DTULTCOMP) = :dias
          AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
    `;
    const result = await connection.execute(sql, { dias }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    
    console.log(`[AUTOMAÇÕES CRON] [SEM_VENDA] Encontrados ${result.rows.length} clientes a ${dias} dias sem comprar.`);
    
    for (const cli of result.rows) {
        const mensagemTexto = renderTemplate(regra.TEMPLATE_MENSAGEM, cli);
        await enviarMensagemEvolution(botGestor, cli.TELEFONE, mensagemTexto);
    }
}

async function processarPeriodoProximo(connection, regra, botGestor) {
    const dias = regra.DIAS_GATILHO || 3;
    
    const sql = `
        SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
               C.PRAZOMEDIO, C.DTULTCOMP
        FROM PCCLIENT C
        JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
        WHERE C.DTULTCOMP IS NOT NULL
          AND C.PRAZOMEDIO > 0
          AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
          AND TRUNC(C.DTULTCOMP + C.PRAZOMEDIO) - TRUNC(SYSDATE) = :dias
    `;
    const result = await connection.execute(sql, { dias }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    
    console.log(`[AUTOMAÇÕES CRON] [PERIODO_PROXIMO] Encontrados ${result.rows.length} clientes.`);
    
    for (const cli of result.rows) {
        const mensagemTexto = renderTemplate(regra.TEMPLATE_MENSAGEM, cli);
        await enviarMensagemEvolution(botGestor, cli.TELEFONE, mensagemTexto);
    }
}

async function processarVisitas(connection, regra, botGestor) {
    // Processar visitas agendadas para amanhã que querem mensagem de chegada
    const sqlAgendadas = `
        SELECT V.ID, C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR
        FROM CANAL_VISITAS V
        JOIN PCCLIENT C ON V.CODCLI = C.CODCLI
        JOIN PCUSUARI U ON V.CODUSUR = U.CODUSUR
        WHERE V.STATUS = 'PENDENTE'
          AND V.TIPO_MENSAGEM IN ('CHEGADA', 'AMBAS')
          AND TRUNC(V.DATA_AGENDADA) = TRUNC(SYSDATE + 1)
          AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
    `;
    const resultAgendadas = await connection.execute(sqlAgendadas, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    
    console.log(`[AUTOMAÇÕES CRON] [VISITA_CHEGADA] Encontradas ${resultAgendadas.rows.length} visitas para amanhã.`);
    
    for (const cli of resultAgendadas.rows) {
        const mensagemTexto = renderTemplate(regra.TEMPLATE_MENSAGEM, cli); // Ou um template específico para chegada
        await enviarMensagemEvolution(botGestor, cli.TELEFONE, mensagemTexto);
    }
    
    // Processar visitas concluídas hoje para mensagem de agradecimento
    const sqlConcluidas = `
        SELECT V.ID, C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR
        FROM CANAL_VISITAS V
        JOIN PCCLIENT C ON V.CODCLI = C.CODCLI
        JOIN PCUSUARI U ON V.CODUSUR = U.CODUSUR
        WHERE V.STATUS = 'REALIZADA'
          AND V.TIPO_MENSAGEM IN ('AGRADECIMENTO', 'AMBAS')
          AND TRUNC(V.ATUALIZADO_EM) = TRUNC(SYSDATE)
          AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
    `;
    const resultConcluidas = await connection.execute(sqlConcluidas, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    
    console.log(`[AUTOMAÇÕES CRON] [VISITA_AGRADECIMENTO] Encontradas ${resultConcluidas.rows.length} visitas realizadas hoje.`);
    
    for (const cli of resultConcluidas.rows) {
        // Pode usar um template de pós-visita se necessário. Aqui usamos o mesmo por simplificação.
        const mensagemTexto = renderTemplate(regra.TEMPLATE_MENSAGEM, cli);
        await enviarMensagemEvolution(botGestor, cli.TELEFONE, mensagemTexto);
    }
}

async function processarDiasEspecificos(connection, regra, botGestor) {
    const diaRegra = String(regra.DIA_ESPECIFICO || '').toUpperCase().trim();
    if (!diaRegra) return;
    
    // Identificar qual é hoje: 
    // Em Oracle: TO_CHAR(SYSDATE, 'D') retorna 1(Dom) a 7(Sab). 'DD' retorna 01 a 31
    // Para simplificar no Node:
    const hoje = new Date();
    const diaMes = hoje.getDate(); // 1 a 31
    const diaSemanaIndex = hoje.getDay(); // 0(Dom) a 6(Sab)
    
    const diasSemanaMap = {0: 'DOM', 1: 'SEG', 2: 'TER', 3: 'QUA', 4: 'QUI', 5: 'SEX', 6: 'SAB'};
    const diaSemanaStr = diasSemanaMap[diaSemanaIndex];
    
    // A regra bate com o dia de hoje? (Seja '10' ou 'SEG')
    // OBS: Como essa rotina varre os clientes com *padrão*, vamos supor que
    // o usuário quer que *se a regra diz 'SEG'*, e *hoje é 'SEG'*,
    // encontre os clientes que concentram compras na Segunda e envie.
    
    // Mas para isso ele teria que criar várias regras! Em vez disso, se a regra diz "10", 
    // avalia quem tem padrão dia 10 e se hoje é 09, envia.
    // Para ser eficiente e simples conforme o plano, vamos verificar se hoje 
    // é dia (regra) - 1. Se for, envia. 
    
    // Por hora, usaremos uma query simplificada para ilustrar o Padrão Mensal:
    // Analisar faturamento dos ultimos 6 meses (PCNFSAID)
    
    // (Como essa query de padroes é muito pesada, uma approach comum em Winthor é usar views materializadas 
    // ou tabelas de agregação. Vamos implementar a lógica baseada na data da última compra e frequência
    // ou simplesmente buscar clientes cuja moda do dia de compra bate com a regra).
    
    console.log(`[AUTOMAÇÕES CRON] [DIA_ESPECIFICO] Regra configurada para: ${diaRegra}`);
    // Exemplo de placeholder para consulta pesada (implementação reduzida para não travar banco)
    const sql = `
        SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR
        FROM PCCLIENT C
        JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
        WHERE NVL(C.TELENT, C.TELCOB) IS NOT NULL
          AND ROWNUM <= 10 -- LIMITADO PARA SEGURANÇA NESSE MVP
    `;
    // Na prática, colocaríamos a análise de count() group by TO_CHAR(DTEMISSAO, 'DD') na PCNFSAID
    // const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    // Para não onerar o banco sem uma view, deixaremos um mock funcional logando a intenção
}
