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
    
    // Get the phone number for CODUSUR = 1
    let user1Res = await conn.execute(`SELECT TELEFONE1, TELEFONE2 FROM PCUSUARI WHERE CODUSUR = 1`);
    if (user1Res.rows.length === 0) {
        fs.writeFileSync('/app/query_user_output.json', JSON.stringify({ error: "User 1 not found" }));
        return;
    }
    const t1 = user1Res.rows[0][0];
    const t2 = user1Res.rows[0][1];
    
    // Now search all users with that phone number
    let sql = `
        SELECT CODUSUR, NOME 
        FROM PCUSUARI 
        WHERE TELEFONE1 = :t1 OR TELEFONE2 = :t1 OR TELEFONE1 = :t2 OR TELEFONE2 = :t2
    `;
    let allUsersRes = await conn.execute(sql, { t1: t1 || 'x', t2: t2 || 'x' });
    
    fs.writeFileSync('/app/query_user_output.json', JSON.stringify(allUsersRes.rows, null, 2));
    console.log("Done");
  } catch (err) {
    fs.writeFileSync('/app/query_user_output.json', JSON.stringify({ error: err.message }));
    console.error(err);
  } finally {
    if (conn) {
      try { await conn.close(); } catch (err) {}
    }
    process.exit(0);
  }
})();
