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
        
        // Remove the [TK-...] prefix from TITULO
        // the length of '[' || ID_ANTIGO || '] ' is length(ID_ANTIGO) + 3
        const res = await conn.execute(`
            UPDATE CANAL_SAC_TICKETS 
            SET TITULO = SUBSTR(TITULO, LENGTH('[' || ID_ANTIGO || '] ') + 1)
            WHERE ID_ANTIGO IS NOT NULL 
              AND TITULO LIKE '[' || ID_ANTIGO || '] %'
        `, [], { autoCommit: true });
        
        console.log("Reverted rows:", res.rowsAffected);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();
