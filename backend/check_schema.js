const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASS,
    connectString: process.env.ORACLE_CONN_STR
  });
  
  try {
      const res = await conn.execute("SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCPEDC' AND COLUMN_NAME LIKE '%CGC%'");
      console.log('Cols PCPEDC:', res.rows.map(r => r[0]));
  } catch (e) {}

  try {
      const res = await conn.execute("SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = 'PCNFSAID' AND COLUMN_NAME IN ('NUMNOTA', 'CHAVENFE', 'NUMPED')");
      console.log('Cols PCNFSAID:', res.rows.map(r => r[0]));
  } catch (e) {}

  try {
      const res = await conn.execute("SELECT OBJECT_NAME, OBJECT_TYPE FROM ALL_OBJECTS WHERE OBJECT_NAME LIKE '%PIX%'");
      console.log('PIX objects:', res.rows);
  } catch(e) {}
  
  process.exit(0);
})();
