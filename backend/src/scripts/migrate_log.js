const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    try {
        if (require('fs').existsSync('/opt/oracle/instantclient_21_12')) {
            oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_21_12' });
        }
    } catch (e) {}

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.DB_USER || process.env.ORACLE_USER || 'system',
            password: process.env.DB_PASSWORD || process.env.ORACLE_PASS || 'oracle',
            connectString: process.env.DB_CONNECT_STRING || process.env.ORACLE_CONN_STR || 'localhost/XEPDB1'
        });

        // 1. Create table CANAL_LOG_IDENTIFICACAO_CLIENTE
        let sql = `
            CREATE TABLE CANAL_LOG_IDENTIFICACAO_CLIENTE (
                ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                TELEFONE VARCHAR2(20),
                DOCUMENTO_INFORMADO VARCHAR2(50),
                CODCLI_LOCALIZADO NUMBER,
                OPCAO_USADA VARCHAR2(100),
                DATA_HORA DATE DEFAULT SYSDATE
            )
        `;
        try {
            await conn.execute(sql);
            console.log("Table CANAL_LOG_IDENTIFICACAO_CLIENTE created.");
        } catch (e) {
            console.log("Table CANAL_LOG_IDENTIFICACAO_CLIENTE might already exist:", e.message);
        }

    } catch (error) {
        console.error("Migration failed:", error);
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
}
run();
