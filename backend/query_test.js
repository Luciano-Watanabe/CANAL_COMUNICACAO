require('dotenv').config();
const oracledb = require('oracledb');
async function run() {
  let connection;
  try {
    const initOracleClient = require('./src/utils/dbSetup').initOracleClient;
    initOracleClient();
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const cfg = await connection.execute("SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'CODFILIAL'");
    console.log('CFG:', cfg.rows);
    const filiais = await connection.execute("SELECT CODIGO, RAZAOSOCIAL FROM PCFILIAL");
    console.log('FILIAIS:', filiais.rows);
  } catch(e) {
    console.error(e);
  } finally {
    if(connection) await connection.close();
  }
}
run();
