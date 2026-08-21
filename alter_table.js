const oraclePool = require('./backend/src/services/oraclePool');
require('dotenv').config();

async function run() {
    let conn;
    try {
        conn = await oraclePool.getConnection();
        await conn.execute('ALTER TABLE CANAL_MENSAGENS ADD TICKET_ID NUMBER');
        console.log('Tabela alterada com sucesso.');
    } catch (err) {
        console.error('Erro:', err);
    } finally {
        if (conn) {
            await conn.close();
        }
    }
}
run();
