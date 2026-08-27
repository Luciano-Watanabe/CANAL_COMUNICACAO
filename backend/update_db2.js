const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch (e) {}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        try {
            await conn.execute("DROP TABLE CANAL_WEBHOOK");
            console.log("Dropped CANAL_WEBHOOK");
        } catch(e) {
            console.log("Drop failed: " + e.message);
        }
        
        try {
            await conn.execute(`
                CREATE TABLE CANAL_WEBHOOK (
                    ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    DATA_RECEBIMENTO TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONTEUDO CLOB,
                    ORIGEM VARCHAR2(100)
                )
            `);
            console.log("Created CANAL_WEBHOOK for events");
        } catch(e) {
            console.log("Create CANAL_WEBHOOK failed: " + e.message);
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) { await conn.close(); }
    }
}
run();
