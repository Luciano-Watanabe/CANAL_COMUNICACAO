const oracledb = require('oracledb');
oracledb.fetchAsString = [oracledb.CLOB];
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
        const res = await conn.execute(`SELECT TRIGGER_NAME, TRIGGER_BODY FROM ALL_TRIGGERS WHERE TABLE_NAME = 'CANAL_REATIVACAO_FILA'`);
        console.log(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
