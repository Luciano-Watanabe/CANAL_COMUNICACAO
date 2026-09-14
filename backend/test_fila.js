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
        
        console.log("=== CANAL_REATIVACAO_FILA (Pendentes/Erros) ===");
        const res1 = await conn.execute(`SELECT ID, TELEFONE, STATUS, DATA_INSERCAO FROM CANAL_REATIVACAO_FILA ORDER BY DATA_INSERCAO DESC FETCH FIRST 5 ROWS ONLY`);
        console.table(res1.rows);

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
