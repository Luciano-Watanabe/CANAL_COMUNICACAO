const oracledb = require('oracledb');
const fs = require('fs');
require('dotenv').config({ path: '/app/.env' });
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e) {}

(async function() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    let botStateRes = await conn.execute(`SELECT TELEFONE, ESTADO FROM CANAL_BOT_STATE WHERE ESTADO LIKE 'VENDEDOR_%'`);
    let usersRes = await conn.execute(`SELECT CODUSUR, TELEFONE1, TELEFONE2 FROM PCUSUARI WHERE TELEFONE1 IS NOT NULL`);
    
    fs.writeFileSync('/app/query_bot_output.json', JSON.stringify({ state: botStateRes.rows, users: usersRes.rows }, null, 2));
    console.log("Done");
  } catch (err) {
    fs.writeFileSync('/app/query_bot_output.json', JSON.stringify({ error: err.message }));
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
