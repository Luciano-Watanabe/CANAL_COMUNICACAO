const oracledb = require('oracledb');
require('dotenv').config({ path: '/app/.env' });
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        try { await conn.execute(`DROP TABLE CANAL_TOKENS_EVOLUTION CASCADE CONSTRAINTS`); console.log('Dropped CANAL_TOKENS_EVOLUTION'); } catch(e){}
        try { await conn.execute(`DROP TABLE CANAL_WEBHOOK CASCADE CONSTRAINTS`); console.log('Dropped CANAL_WEBHOOK'); } catch(e){}
        try { await conn.execute(`DROP TABLE CANAL_AGENDAMENTO_STATUS CASCADE CONSTRAINTS`); console.log('Dropped CANAL_AGENDAMENTO_STATUS'); } catch(e){}
        try { await conn.execute(`DROP TABLE CANAL_WEBHOOK_STATE CASCADE CONSTRAINTS`); console.log('Dropped CANAL_WEBHOOK_STATE'); } catch(e){}
        
        console.log("Tabelas dropadas. O init_oracle vai recriá-las.");
    } catch (e) {
        console.error(e);
    } finally {
        if(conn) await conn.close();
        process.exit(0);
    }
}
run();
