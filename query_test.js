const oracledb = require('oracledb');
async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        await conn.execute(`SELECT ID, DT_REQUISICAO, CONTEUDO FROM JCWEBHOOK WHERE ORIGEM = 'whats' AND ID > 0 ORDER BY ID ASC`);
        console.log("JCWEBHOOK OK");
    } catch(e) {
        console.error("Erro JCWEBHOOK:", e.message);
    }
    
    try {
        await conn.execute(`SELECT LAST_PROCESSED_ID FROM CANAL_WEBHOOK_STATE WHERE ID = 1`);
        console.log("CANAL_WEBHOOK_STATE OK");
    } catch(e) {
        console.error("Erro CANAL_WEBHOOK_STATE:", e.message);
    }
    
    // Also try the insert
    try {
       await conn.execute(`INSERT INTO CANAL_WEBHOOK_STATE (ID, LAST_PROCESSED_ID) SELECT 1, 0 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM CANAL_WEBHOOK_STATE WHERE ID = 1)`);
       console.log("INSERT OK");
    } catch(e) {
       console.error("Erro INSERT:", e.message);
    }

    if(conn) await conn.close();
}
run();
