const cron = require('node-cron');
const oracledb = require('oracledb');

// Roda todo dia às 07:00 da manhã
cron.schedule('0 7 * * *', async () => {
    console.log('[GERADOR ROTAS CRON] Iniciando verificação de rotas para o dia atual...');
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const diasSemanaMap = {
            0: 'DOMINGO',
            1: 'SEGUNDA',
            2: 'TERCA',
            3: 'QUARTA',
            4: 'QUINTA',
            5: 'SEXTA',
            6: 'SABADO'
        };

        const hoje = new Date();
        const diaSemanaStr = diasSemanaMap[hoje.getDay()];

        console.log(`[GERADOR ROTAS CRON] Hoje é ${diaSemanaStr}. Buscando clientes na PCROTACLI...`);

        // Busca todos os clientes programados para hoje na rota de todos os vendedores ativos
        const sqlBusca = `
            SELECT R.CODUSUR, R.CODCLI, R.SEQUENCIA
            FROM PCROTACLI R
            WHERE (R.DIASEMANA = :diasemana OR (R.DIASEMANA = 'TERÇA' AND :diasemana = 'TERCA'))
        `;

        const result = await connection.execute(sqlBusca, { diasemana: diaSemanaStr });

        if (result.rows.length === 0) {
            console.log('[GERADOR ROTAS CRON] Nenhuma rota encontrada para hoje.');
            return;
        }

        console.log(`[GERADOR ROTAS CRON] ${result.rows.length} clientes encontrados para hoje. Inserindo na CANAL_VISITAS...`);

        let inserted = 0;
        const horaBase = new Date();
        horaBase.setHours(8, 0, 0, 0); // Começa a agendar a partir das 08:00

        for (const row of result.rows) {
            const codusur = row[0];
            const codcli = row[1];
            const sequencia = row[2] || 1;

            // Distribuir no tempo baseado na sequência (ex: 8:00, 8:15, 8:30)
            const dataAgendada = new Date(horaBase.getTime() + (sequencia - 1) * 15 * 60000);

            // Verificar se ja nao inseriu hoje
            const checkSql = `
                SELECT 1 FROM CANAL_VISITAS 
                WHERE CODCLI = :codcli AND CODUSUR = :codusur 
                  AND TRUNC(DATA_AGENDADA) = TRUNC(SYSDATE)
            `;
            const checkRes = await connection.execute(checkSql, { codcli, codusur });
            
            if (checkRes.rows.length === 0) {
                await connection.execute(`
                    INSERT INTO CANAL_VISITAS (CODCLI, CODUSUR, DATA_AGENDADA, STATUS, TIPO_MENSAGEM, SINALIZADO_VENDEDOR)
                    VALUES (:codcli, :codusur, :data_agendada, 'PENDENTE', 'VISITA_ROTA', 'N')
                `, {
                    codcli: codcli,
                    codusur: codusur,
                    data_agendada: dataAgendada
                }, { autoCommit: false });
                inserted++;
            }
        }

        await connection.commit();
        console.log(`[GERADOR ROTAS CRON] Geração concluída. ${inserted} novas visitas agendadas para hoje.`);
    } catch (error) {
        console.error('[GERADOR ROTAS CRON] Erro geral:', error);
        if (connection) {
             try { await connection.rollback(); } catch (e) {}
        }
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});
