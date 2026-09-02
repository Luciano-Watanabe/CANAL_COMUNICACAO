require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR });
  try {
    const res = await conn.execute("SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS WHERE TABLE_NAME IN ('CANAL_MENSAGENS','CANAL_TOKENS_EVOLUTION','CANAL_CONFIGURACOES') ORDER BY TABLE_NAME, COLUMN_ID");
    res.rows.forEach(r => console.log(String(r[0]).padEnd(22), String(r[1]).padEnd(24), String(r[2]).padEnd(14), r[3]));
  } catch (e) { console.error('ERR', e.message); }
  await conn.close();
  process.exit(0);
})();
