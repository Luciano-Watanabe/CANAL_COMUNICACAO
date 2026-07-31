require('dotenv').config();
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
        const result = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES`);
        console.log("=== CONFIGS ===");
        result.rows.forEach(r => console.log(r[0], '=', r[1]));
        console.log("===============");
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
