const oracledb = require('oracledb');
require('dotenv').config({ path: '/app/.env' });
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`
      SELECT column_name, data_type, data_length, nullable, data_default
      FROM all_tab_columns
      WHERE table_name = 'CANAL_SAC_TICKETS_MSGS'
      ORDER BY column_id
    `);
    console.log(result.rows);
  } catch(e) { console.error(e); } finally { if(conn) await conn.close(); }
}
run();
