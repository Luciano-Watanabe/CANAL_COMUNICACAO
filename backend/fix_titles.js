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
            UPDATE CANAL_SAC_TICKETS 
            SET TITULO = REPLACE(TITULO, '[TK-TK-', '[TK-')
            WHERE TITULO LIKE '[TK-TK-%'
        `, [], { autoCommit: true });
        
        const res2 = await conn.execute(`
            UPDATE CANAL_SAC_TICKETS 
            SET TITULO = '[' || ID_ANTIGO || '] ' || TITULO
            WHERE ID_ANTIGO IS NOT NULL AND TITULO NOT LIKE '[TK-%'
        `, [], { autoCommit: true });
        
        console.log("Fixed rows (duplicate TK-TK-):", res.rowsAffected);
        console.log("Updated rows (new tickets):", res2.rowsAffected);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();
