const oracledb = require('oracledb');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend/.env' });

async function run() {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE LIKE '%GROK%'`);
    console.log(result.rows);
    await conn.close();
  } catch(e) { console.error(e); }
}
run();
