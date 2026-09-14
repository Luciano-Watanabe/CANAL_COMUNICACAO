require('dotenv').config({ path: '../.env' });
const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const res = await conn.execute(`
            SELECT ID, ID_ANTIGO, TITULO 
            FROM CANAL_SAC_TICKETS 
            WHERE ID_ANTIGO IS NOT NULL
            AND ROWNUM <= 5
        `, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log("Sample Data:");
        console.table(res.rows);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();
