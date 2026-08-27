const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const r1 = await conn.execute(`SELECT ID, DATA_RECEBIMENTO, ORIGEM FROM CANAL_WEBHOOK ORDER BY ID DESC FETCH FIRST 5 ROWS ONLY`);
        console.log('--- CANAL_WEBHOOK ---');
        console.dir(r1.rows, {depth: null});
        
        const r2 = await conn.execute(`SELECT ID, LAST_PROCESSED_ID FROM CANAL_WEBHOOK_STATE`);
        console.log('--- CANAL_WEBHOOK_STATE ---');
        console.dir(r2.rows, {depth: null});
    } catch(e) { console.error(e); } finally { if(conn) await conn.close(); }
}
run();
