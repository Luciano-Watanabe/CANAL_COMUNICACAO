require('dotenv').config();
const oracledb = require('oracledb');
oracledb.initOracleClient();

(async () => {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    await conn.execute("ALTER TABLE CANAL_SAC_TICKETS MODIFY NOTA_AVALIACAO NUMBER(2)");
    console.log('Success');
  } catch(e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
    process.exit(0);
  }
})();
