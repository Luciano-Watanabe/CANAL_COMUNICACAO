const oracledb = require('oracledb');
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    const res1 = await connection.execute("SELECT column_name FROM user_tab_columns WHERE table_name = 'CANAL_MENSAGENS'");
    console.log("Colunas CANAL_MENSAGENS:", res1.rows.map(r => r[0]));
    
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) await connection.close();
  }
}
run();
