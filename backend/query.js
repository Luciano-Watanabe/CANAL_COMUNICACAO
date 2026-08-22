const oracledb = require('oracledb');
const fs = require('fs');
require('dotenv').config({ path: '/app/.env' });

try {
  oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch(e) {}

(async function() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    let clientRes = await conn.execute(`SELECT CODCLI, CLIENTE, CODUSUR1, CODUSUR2, CODUSUR3 FROM PCCLIENT WHERE CODCLI = 6709`);
    let ticketsRes = await conn.execute(`SELECT ID, CODCLI, STATUS, DESCRICAO FROM CANAL_SAC_TICKETS WHERE CODCLI = '6709' OR CODCLI = 6709`);
    
    const output = {
        client: clientRes.rows,
        tickets: ticketsRes.rows
    };
    
    fs.writeFileSync('/app/query_output.json', JSON.stringify(output, null, 2));
    console.log("Done");
  } catch (err) {
    fs.writeFileSync('/app/query_output.json', JSON.stringify({ error: err.message }));
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
