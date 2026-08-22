const oracledb = require('oracledb');
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
    
    await conn.execute(`
        DELETE FROM CANAL_MENSAGENS 
        WHERE SENTIDO = 'IN' 
          AND TEXTO LIKE '%Digite algo que seja ao menos legível%'
    `, [], { autoCommit: true });
    
    console.log("Cleanup Done");
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
