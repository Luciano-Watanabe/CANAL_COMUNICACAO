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
            SELECT ID_TICKET, ID_ANTIGO, TITULO 
            FROM CANAL_SAC_TICKETS 
            WHERE ROWNUM <= 10
        `);
        console.log("Sample Data:");
        console.table(res.rows);
        
        const res2 = await conn.execute(`
            SELECT COUNT(*) AS CNT
            FROM CANAL_SAC_TICKETS
            WHERE ID_ANTIGO IS NOT NULL
        `);
        console.log("Total tickets with ID_ANTIGO:", res2.rows[0]);

        const res3 = await conn.execute(`
            SELECT COUNT(*) AS CNT
            FROM CANAL_SAC_TICKETS
            WHERE TITULO LIKE '[TK-%'
        `);
        console.log("Total tickets starting with [TK-]:", res3.rows[0]);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();
