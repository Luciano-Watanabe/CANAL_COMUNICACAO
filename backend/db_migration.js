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
        
        try {
            await conn.execute(`ALTER TABLE CANAL_VISITAS ADD RETORNO VARCHAR2(4000)`);
            console.log("Coluna RETORNO adicionada.");
        } catch(e) {
            console.log("Erro RETORNO (pode já existir):", e.message);
        }

        try {
            await conn.execute(`ALTER TABLE CANAL_VISITAS ADD SINALIZADO_VENDEDOR CHAR(1) DEFAULT 'N'`);
            console.log("Coluna SINALIZADO_VENDEDOR adicionada.");
        } catch(e) {
            console.log("Erro SINALIZADO_VENDEDOR (pode já existir):", e.message);
        }

        console.log("Migração concluída com sucesso.");
    } catch (e) {
        console.error("Erro geral:", e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
