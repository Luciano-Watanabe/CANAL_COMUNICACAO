const cacheService = require('./src/services/cacheService');
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        await cacheService.loadVendedoresAndClientes(conn);
        console.log('Configs:', cacheService.globalConfigs);
        console.log('Destino:', cacheService.getDestinoFinal('5511999999999'));
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
