const oracledb = require('oracledb');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });
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
            SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH 
            FROM ALL_TAB_COLUMNS 
            WHERE TABLE_NAME = 'CANAL_SAC_TICKETS'
            ORDER BY COLUMN_ID
        `);
        console.log('Columns in CANAL_SAC_TICKETS:');
        for (const row of res.rows) {
            console.log(row[0], row[1], row[2]);
        }
    } catch (e) {
        console.error("Erro geral:", e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
