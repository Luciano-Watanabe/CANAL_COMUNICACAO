const oracledb = require('oracledb');
require('dotenv').config({ path: '/app/.env' });
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (e) {
    console.error("Init err:", e);
}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const alterStatements = [
            `ALTER TABLE CANAL_SAC_TICKETS ADD DATA_AGENDAMENTO TIMESTAMP`,
            `ALTER TABLE CANAL_SAC_TICKETS ADD AGENDAMENTO_CODPROD NUMBER`,
            `ALTER TABLE CANAL_SAC_TICKETS ADD AGENDAMENTO_QTDE NUMBER`,
            `ALTER TABLE CANAL_SAC_TICKETS ADD AGENDAMENTO_MOTORISTA_NOME VARCHAR2(255)`,
            `ALTER TABLE CANAL_SAC_TICKETS ADD AGENDAMENTO_MOTORISTA_TEL VARCHAR2(50)`,
            `ALTER TABLE CANAL_SAC_TICKETS ADD AGENDAMENTO_ENVIADO CHAR(1) DEFAULT 'N'`
        ];

        for (let sql of alterStatements) {
            try {
                await conn.execute(sql);
                console.log("Sucesso:", sql);
            } catch(e) {
                console.log("Ignorado (provavelmente já existe):", sql, "Erro:", e.message);
            }
        }

        console.log("Migração concluída com sucesso.");
    } catch (e) {
        console.error("Erro geral:", e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
