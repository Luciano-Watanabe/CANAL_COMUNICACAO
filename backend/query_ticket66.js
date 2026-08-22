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
    
    let res = await conn.execute(`
        SELECT T.ID, T.CODCLI, C.CODUSUR1, C.CLIENTE, T.STATUS
        FROM CANAL_SAC_TICKETS T
        LEFT JOIN PCCLIENT C ON C.CODCLI = T.CODCLI
        WHERE T.ID = 66
    `);
    
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
