const oracledb = require('oracledb');
require('dotenv').config({ path: '../.env' });
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e) {}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const res1 = await conn.execute(`SELECT ID, LOG_ERRO FROM CANAL_REATIVACAO_FILA WHERE ID IN (345, 344, 343) ORDER BY ID DESC`);
        for (let row of res1.rows) {
            console.log("ID:", row[0]);
            if (row[1]) {
                const log = await row[1].getData();
                console.log("LOG:", log);
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
