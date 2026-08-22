const oraclePool = require('./backend/src/services/oraclePool');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });

async function run() {
    await oraclePool.initPool();
    let conn = await oraclePool.getConnection();
    const tel = '5512981466409';
    try {
        const result = await conn.execute(`
            SELECT CODUSUR, TELEFONE1, TELEFONE2 FROM PCUSUARI
            WHERE 
              (REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE1, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
               OR  REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE2, ' ', ''), '-', ''), '(', ''), ')', '') = :tel)
        `, { tel: tel });
        console.log('Result:', result.rows);
    } catch(e) { console.error(e); }
    await conn.close();
    process.exit(0);
}
run();
