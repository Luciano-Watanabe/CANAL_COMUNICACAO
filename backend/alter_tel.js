require('dotenv').config();
const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_21_12' }); } catch(e){ console.error("Oracle Client init error:", e); }
async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    await conn.execute(`ALTER TABLE CANAL_MENSAGENS MODIFY (TELEFONE_CLIENTE VARCHAR2(50))`);
    console.log("Coluna alterada com sucesso!");
  } catch (err) {
    console.error("Erro ao alterar coluna:", err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) { console.error(err); }
    }
  }
}
run();
