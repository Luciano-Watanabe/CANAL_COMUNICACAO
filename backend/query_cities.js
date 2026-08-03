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
    
    // Check coverage (cities and counts)
    const result1 = await connection.execute(`
      SELECT MUNICENT, COUNT(*) as qtd
      FROM PCCLIENT
      GROUP BY MUNICENT
      ORDER BY qtd DESC
      FETCH FIRST 10 ROWS ONLY
    `);
    console.log("Top Cities:", result1.rows);
    
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}
run();
