require('dotenv').config();
const oracledb = require('oracledb');

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const res = await conn.execute(`
            SELECT column_name, data_type 
            FROM user_tab_columns 
            WHERE table_name = 'CANAL_SAC_TICKETS'
        `);
        console.log("Columns:", res.rows);

        const res2 = await conn.execute(`
            SELECT constraint_name, search_condition 
            FROM user_constraints 
            WHERE table_name = 'CANAL_SAC_TICKETS' AND constraint_type = 'C'
        `);
        console.log("Constraints:", res2.rows);

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
        process.exit();
    }
}
run();
