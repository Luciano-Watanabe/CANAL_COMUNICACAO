const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({
    user: 'AGDIST', password: 'AGDIST', connectString: '172.16.5.12:1521/WINT'
  });
  for (const t of ['CANAL_MENSAGENS', 'CANAL_TOKENS_EVOLUTION', 'PCUSUARI', 'PCCLIENT']) {
    const res = await conn.execute("SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :n ORDER BY COLUMN_ID", { n: t });
    console.log(t + ':', res.rows.map(r => r[0]).join(', '));
  }
  await conn.close();
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
