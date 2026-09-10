const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    } catch(e) {}
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASSWORD,
            connectString: process.env.ORACLE_CONN_STRING
        });
        const res = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'CANAL_BOT_MENSAGENS'`);
        console.log(res.rows);
    } catch (err) {
        console.error(err);
    } finally {
        if (conn) await conn.close();
    }
}
require('dotenv').config();
run();
