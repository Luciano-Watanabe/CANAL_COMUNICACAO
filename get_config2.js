require('dotenv').config();
const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch (e) {}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const result = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('MODO_TESTE_GESTOR', 'NUMERO_TESTE_GESTOR')`);
        console.log(result.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
