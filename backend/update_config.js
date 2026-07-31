require('dotenv').config();
const oracledb = require('oracledb');

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        await conn.execute(`UPDATE CANAL_CONFIGURACOES SET VALOR = 'N' WHERE CHAVE = 'MODO_TESTE_GESTOR'`, [], { autoCommit: true });
        console.log('Configuração MODO_TESTE_GESTOR atualizada para N com sucesso.');
    } catch (e) {
        console.error('Erro:', e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
