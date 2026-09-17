const oracledb = require('oracledb');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend/.env' });
async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    // PCUSUARI
    const res1 = await connection.execute("SELECT CODUSUR, NOME FROM PCUSUARI WHERE NOME LIKE '%DIEGO%'");
    console.log("Usuarios DIEGO:", res1.rows);
    
    // Tokens
    const res2 = await connection.execute("SELECT CODUSUR, INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION");
    console.log("Tokens configurados:", res2.rows);
    
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) await connection.close();
  }
}
run();
