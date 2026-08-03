const oracledb = require('oracledb');
require('dotenv').config();

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    // Check PCATIVI columns
    const result1 = await connection.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCATIVI'`);
    console.log("PCATIVI Columns:", result1.rows.map(r => r[0]).join(', '));
    
    // Get sample data
    const result2 = await connection.execute(`SELECT * FROM PCATIVI FETCH FIRST 5 ROWS ONLY`);
    console.log("Sample PCATIVI:", result2.rows);

  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}
run();
