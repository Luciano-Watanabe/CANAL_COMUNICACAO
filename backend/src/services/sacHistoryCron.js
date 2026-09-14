const cron = require('node-cron');
const oracledb = require('oracledb');
const oraclePool = require('./oraclePool');

const JSON_URL = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQ9kiFl9kYuNmelT23T_Cf3EOHgaP7O46uEnbJsj3pVsz-vKamj47uAfnVNzJ8HdYU5YTd8CDamxjJLm6VmvhcEbm81Xv-xo5mvpw14HW7bfD3Bw0B8MKNQDlOscZeL1Pea9F2gorddhCl513SQ8nNfec6VzAtscb-x7kWZGxPKSPOG5yGWY69LrCDVML4DbUZkaqt9Cht7EyWcVSu1UD1auM1G1zVHvtGehwWxULaLzKZVaJQJrHPXYMO_-UgEuFYLuyF9bAbuMx7jP14B551w_zCLWw&lib=MAPorqy7D8Gcb2h4vYId7zkOWWHwvxREr';

const statusMap = {
    'Aberto': 'ABERTOS',
    'Em Atendimento': 'EM ATENDIMENTO',
    'Fechado': 'FECHADOS (AGUARDANDO AVALIAÇÃO)',
    'Resolvido': 'FINALIZADOS'
};

function formatStatus(status) {
    if (!status) return 'ABERTOS';
    return statusMap[status] || status.toUpperCase(); 
}

function parseId(idStr, prefix) {
    if (!idStr) return null;
    const parsed = parseInt(idStr.replace(prefix, ''), 10);
    return isNaN(parsed) ? null : parsed;
}

async function syncSacHistory() {
    let conn;
    try {
        console.log('[CRON SAC] Iniciando sincronização do Google Sheets...');
        const response = await fetch(JSON_URL);
        const data = await response.json();
        const tickets = data.tickets;
        console.log(`[CRON SAC] Dados baixados. Total de tickets no Sheets: ${tickets.length}`);

        conn = await oraclePool.getConnection();

        // Carregar mapa de departamentos
        const deptResult = await conn.execute('SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS');
        const deptMap = {};
        deptResult.rows.forEach(r => {
            deptMap[r[1]] = r[0]; // nome -> id
        });

        let insertedCount = 0;
        let updatedCount = 0;
        let msgInsertedCount = 0;
        let errorCount = 0;

        for (const t of tickets) {
            try {
                const codcli = parseId(t.customerId, 'c');
                const codusur = parseId(t.sellerId, 'v');
                const departamentoId = deptMap[t.category] || null;
                const statusStr = formatStatus(t.status);
                const createdAt = new Date(t.createdAt);
                
                // Verifica se o ticket já existe
                const checkRes = await conn.execute(`SELECT ID FROM CANAL_SAC_TICKETS WHERE ID_ANTIGO = :idAntigo`, { idAntigo: t.id });
                let ticketId;

                if (checkRes.rows.length > 0) {
                    // UPDATE
                    ticketId = checkRes.rows[0][0];
                    const updateSql = `
                        UPDATE CANAL_SAC_TICKETS SET
                            TELEFONE = :telefone,
                            CODCLI = :codcli,
                            DEPARTAMENTO_ID = :deptoId,
                            DESCRICAO = :descricao,
                            STATUS = :status,
                            CODUSUR = :codusur,
                            TITULO = :titulo,
                            CATEGORIA = :categoria,
                            PRIORIDADE = :prioridade,
                            AVALIACAO = :avaliacao,
                            NUM_PEDIDO = :numPedido,
                            NUM_NOTA = :numNota,
                            ATUALIZADO_EM = SYSDATE
                        WHERE ID = :tId
                    `;
                    const updateBinds = {
                        telefone: t.contatoTelefone || null,
                        codcli: codcli,
                        deptoId: departamentoId,
                        descricao: t.description || 'Sem descrição',
                        status: statusStr,
                        codusur: codusur,
                        titulo: t.title ? `[TK-${t.id}] ${t.title}` : `[TK-${t.id}] Sem título`,
                        categoria: t.category || null,
                        prioridade: t.priority || null,
                        avaliacao: t.rating || null,
                        numPedido: t.orderNumber || null,
                        numNota: t.nfNumber || null,
                        tId: ticketId
                    };
                    await conn.execute(updateSql, updateBinds, { autoCommit: true });
                    updatedCount++;
                } else {
                    // INSERT
                    const insertTicketSql = `
                        INSERT INTO CANAL_SAC_TICKETS (
                            ID_ANTIGO, TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS, CRIADO_EM, ATUALIZADO_EM,
                            CODUSUR, TITULO, CATEGORIA, PRIORIDADE, AVALIACAO, NUM_PEDIDO, NUM_NOTA
                        ) VALUES (
                            :idAntigo, :telefone, :codcli, :deptoId, :descricao, :status, :criadoEm, SYSDATE,
                            :codusur, :titulo, :categoria, :prioridade, :avaliacao, :numPedido, :numNota
                        ) RETURNING ID INTO :newId
                    `;
                    const insertBinds = {
                        idAntigo: t.id,
                        telefone: t.contatoTelefone || null,
                        codcli: codcli,
                        deptoId: departamentoId,
                        descricao: t.description || 'Sem descrição',
                        status: statusStr,
                        criadoEm: createdAt,
                        codusur: codusur,
                        titulo: t.title ? `[TK-${t.id}] ${t.title}` : `[TK-${t.id}] Sem título`,
                        categoria: t.category || null,
                        prioridade: t.priority || null,
                        avaliacao: t.rating || null,
                        numPedido: t.orderNumber || null,
                        numNota: t.nfNumber || null,
                        newId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
                    };
                    const res = await conn.execute(insertTicketSql, insertBinds, { autoCommit: true });
                    ticketId = res.outBinds.newId[0];
                    insertedCount++;
                }

                // Sincronizar mensagens (MERGE)
                // Pega as mensagens atuais no banco para este ticket (ignoramos espaço extra)
                const msgsRes = await conn.execute(`SELECT ENVIADO_POR, MENSAGEM FROM CANAL_SAC_TICKETS_MSGS WHERE TICKET_ID = :tId`, { tId: ticketId });
                const existingMsgs = new Set();
                msgsRes.rows.forEach(r => {
                    const author = r[0] || '';
                    const text = (r[1] || '').trim().toLowerCase();
                    existingMsgs.add(`${author}::${text}`);
                });

                if (t.updates && Array.isArray(t.updates)) {
                    for (const msg of t.updates) {
                        const author = msg.author || 'SISTEMA';
                        const text = (msg.message || '').trim().toLowerCase();
                        const key = `${author}::${text}`;

                        if (!existingMsgs.has(key)) {
                            // Nova mensagem do Sheets que não existe no banco
                            let insertMsgSql = `
                                INSERT INTO CANAL_SAC_TICKETS_MSGS (
                                    TICKET_ID, ENVIADO_POR, MENSAGEM
                                ) VALUES (
                                    :tId, :enviadoPor, :mensagem
                                )
                            `;
                            const msgBinds = {
                                tId: ticketId,
                                enviadoPor: msg.author || 'SISTEMA',
                                mensagem: msg.message || ''
                            };
                            
                            if (msg.date) {
                                insertMsgSql = `
                                    INSERT INTO CANAL_SAC_TICKETS_MSGS (
                                        TICKET_ID, ENVIADO_POR, MENSAGEM, DATA_HORA
                                    ) VALUES (
                                        :tId, :enviadoPor, :mensagem, TO_TIMESTAMP(:dataHora, 'DD/MM/YYYY, HH24:MI:SS')
                                    )
                                `;
                                msgBinds.dataHora = msg.date;
                            }
                            await conn.execute(insertMsgSql, msgBinds, { autoCommit: true });
                            msgInsertedCount++;
                            existingMsgs.add(key); // Evita duplicar se houver mesma msg repetida no json
                        }
                    }
                }

                if (t.attachments && Array.isArray(t.attachments)) {
                    for (const att of t.attachments) {
                        const attText = `📄 Arquivo anexo importado: ${att.name} \nURL: ${att.url}`;
                        const key = `SISTEMA::${attText.toLowerCase()}`;
                        
                        if (!existingMsgs.has(key)) {
                            const attSql = `
                                INSERT INTO CANAL_SAC_TICKETS_MSGS (
                                    TICKET_ID, ENVIADO_POR, MENSAGEM
                                ) VALUES (
                                    :tId, 'SISTEMA', :mensagem
                                )
                            `;
                            await conn.execute(attSql, { tId: ticketId, mensagem: attText }, { autoCommit: true });
                            msgInsertedCount++;
                            existingMsgs.add(key);
                        }
                    }
                }

            } catch (err) {
                console.error(`[CRON SAC] Erro no ticket ${t.id}:`, err.message);
                errorCount++;
            }
        }

        console.log(`[CRON SAC] Sincronização finalizada. Inseridos: ${insertedCount}. Atualizados: ${updatedCount}. Msg novas: ${msgInsertedCount}. Erros: ${errorCount}`);

    } catch (err) {
        console.error('[CRON SAC] Erro geral na sincronização:', err);
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {}
        }
    }
}

// Agendar para as 22h todos os dias
cron.schedule('0 22 * * *', () => {
    syncSacHistory();
});

console.log('[WORKER] Cron de histórico SAC (Google Sheets) agendado para as 22h.');

module.exports = { syncSacHistory };
