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
        await conn.execute(`UPDATE CANAL_REATIVACAO_FILA SET STATUS = 'PENDENTE' WHERE STATUS IN ('ERRO', 'PROCESSANDO') AND ID IN (343, 344, 345)`, [], { autoCommit: true });
        console.log("Fila atualizada para PENDENTE.");
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
