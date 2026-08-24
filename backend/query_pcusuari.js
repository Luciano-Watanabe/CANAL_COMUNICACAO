const oracledb = require('oracledb');
require('dotenv').config({ path: '/app/.env' });
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (e) {
    console.error("Init err:", e);
}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        const res = await conn.execute(`
            SELECT COLUMN_NAME 
            FROM ALL_TAB_COLUMNS 
            WHERE TABLE_NAME = 'PCUSUARI' AND COLUMN_NAME LIKE '%TEL%'
        `);
        console.log('Tel Cols in PCUSUARI:', res.rows.map(r => r[0]));
    } catch (e) {
        console.error("Erro geral:", e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
