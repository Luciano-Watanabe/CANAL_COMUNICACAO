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
    
    let allTicketsRes = await conn.execute(`
        SELECT T.ID, C.CODCLI, C.CLIENTE, T.STATUS
        FROM CANAL_SAC_TICKETS T
        JOIN PCCLIENT C ON C.CODCLI = T.CODCLI
        WHERE C.CODUSUR1 = 1
    `);
    
    fs.writeFileSync('/app/query_all_output.json', JSON.stringify(allTicketsRes.rows, null, 2));
    console.log("Done");
  } catch (err) {
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
