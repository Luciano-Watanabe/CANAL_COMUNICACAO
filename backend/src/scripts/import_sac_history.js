require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });
const oracledb = require('oracledb');

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

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

async function run() {
    let conn;
    try {
        console.log('Baixando dados do Google Sheets...');
        const response = await fetch(JSON_URL);
        const data = await response.json();
        const tickets = data.tickets;
        console.log(`Dados baixados com sucesso. Total de tickets: ${tickets.length}`);

        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        console.log('Conectado ao Oracle');

        // Atualizar constraint de STATUS
        try {
            await conn.execute(`ALTER TABLE CANAL_SAC_TICKETS DROP CONSTRAINT CK_CANAL_SAC_TICKETS_STATUS`);
            console.log('Constraint antiga removida.');
        } catch (e) { }
        try {
            await conn.execute(`
                ALTER TABLE CANAL_SAC_TICKETS 
                ADD CONSTRAINT CK_CANAL_SAC_TICKETS_STATUS 
                CHECK (STATUS IN ('ABERTO', 'ABERTOS', 'EM ATENDIMENTO', 'FECHADO', 'FECHADOS (AGUARDANDO AVALIAÇÃO)', 'FINALIZADO', 'FINALIZADOS'))
            `);
            console.log('Constraint de STATUS atualizada com novos valores permitidos.');
        } catch (e) {
            console.error('Aviso ao adicionar constraint:', e.message);
        }

        // Carregar mapa de departamentos
        const deptResult = await conn.execute('SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS');
        const deptMap = {};
        deptResult.rows.forEach(r => {
            deptMap[r[1]] = r[0]; // nome -> id
        });

        let successCount = 0;
        let errorCount = 0;

        for (const t of tickets) {
            try {
                // Prepara dados
                const codcli = parseId(t.customerId, 'c');
                const codusur = parseId(t.sellerId, 'v');
                const departamentoId = deptMap[t.category] || null;
                const statusStr = formatStatus(t.status);
                
                // Converte data
                const createdAt = new Date(t.createdAt);

                // Insert na tabela principal
                const insertTicketSql = `
                    INSERT INTO CANAL_SAC_TICKETS (
                        ID_ANTIGO, TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS, CRIADO_EM, ATUALIZADO_EM,
                        CODUSUR, TITULO, CATEGORIA, PRIORIDADE, AVALIACAO, NUM_PEDIDO, NUM_NOTA
                    ) VALUES (
                        :idAntigo, :telefone, :codcli, :deptoId, :descricao, :status, :criadoEm, :atualizadoEm,
                        :codusur, :titulo, :categoria, :prioridade, :avaliacao, :numPedido, :numNota
                    ) RETURNING ID INTO :newId
                `;

                const ticketBinds = {
                    idAntigo: t.id,
                    telefone: t.contatoTelefone || null,
                    codcli: codcli,
                    deptoId: departamentoId,
                    descricao: t.description || 'Sem descrição',
                    status: statusStr,
                    criadoEm: createdAt,
                    atualizadoEm: createdAt,
                    codusur: codusur,
                    titulo: t.title || 'Sem título',
                    categoria: t.category || null,
                    prioridade: t.priority || null,
                    avaliacao: t.rating || null,
                    numPedido: t.orderNumber || null,
                    numNota: t.nfNumber || null,
                    newId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
                };

                const res = await conn.execute(insertTicketSql, ticketBinds, { autoCommit: true });
                const newTicketId = res.outBinds.newId[0];

                // Insert das atualizações (mensagens)
                if (t.updates && Array.isArray(t.updates)) {
                    for (const msg of t.updates) {
                        const msgSql = `
                            INSERT INTO CANAL_SAC_TICKETS_MSGS (
                                TICKET_ID, ENVIADO_POR, MENSAGEM
                            ) VALUES (
                                :tId, :enviadoPor, :mensagem
                            )
                        `;
                        
                        const msgBinds = {
                            tId: newTicketId,
                            enviadoPor: msg.author || 'SISTEMA',
                            mensagem: msg.message || ''
                        };
                        
                        let insertMsgSql = msgSql;
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
                    }
                }

                // Insert de anexos como mensagem do sistema
                if (t.attachments && Array.isArray(t.attachments)) {
                    for (const att of t.attachments) {
                        const attSql = `
                            INSERT INTO CANAL_SAC_TICKETS_MSGS (
                                TICKET_ID, ENVIADO_POR, MENSAGEM
                            ) VALUES (
                                :tId, 'SISTEMA', :mensagem
                            )
                        `;
                        const attBinds = {
                            tId: newTicketId,
                            mensagem: `📄 Arquivo anexo importado: ${att.name} \nURL: ${att.url}`
                        };
                        await conn.execute(attSql, attBinds, { autoCommit: true });
                    }
                }

                successCount++;
            } catch (err) {
                console.error(`Erro ao importar ticket ${t.id}:`, err.message);
                errorCount++;
            }
        }

        console.log(`Importação finalizada. Sucesso: ${successCount}. Erros: ${errorCount}`);

    } catch (err) {
        console.error('Erro geral:', err);
    } finally {
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
}

run();
