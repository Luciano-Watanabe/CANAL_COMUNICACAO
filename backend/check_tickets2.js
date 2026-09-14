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
            SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'CANAL_SAC_TICKETS'
        `);
        console.log("Columns:");
        console.table(res.rows);
        
        const res2 = await conn.execute(`
            SELECT *
            FROM CANAL_SAC_TICKETS
            WHERE ROWNUM <= 5
        `);
        console.log("Sample Data:");
        console.log(res2.rows);

        const res3 = await conn.execute(`
            SELECT COUNT(*) AS CNT
            FROM CANAL_SAC_TICKETS
            WHERE ID_ANTIGO IS NOT NULL
        `);
        console.log("Total tickets with ID_ANTIGO:", res3.rows[0]);
    } catch(e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
    }
}
run();
