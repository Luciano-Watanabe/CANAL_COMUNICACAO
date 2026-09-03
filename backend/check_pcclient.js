const oracledb = require('oracledb');
async function run() {
  let connection;
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await connection.execute("SELECT COLUMN_NAME FROM user_tab_columns WHERE table_name = 'PCCLIENT'");
    console.log(result.rows.map(r => r[0]).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    if(connection) await connection.close();
  }
}
run();
