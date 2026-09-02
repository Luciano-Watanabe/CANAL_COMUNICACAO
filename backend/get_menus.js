const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({
    user: 'AGDIST', password: 'AGDIST', connectString: '172.16.5.12:1521/WINT'
  });
  const res = await conn.execute("SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'MENU_PERMISSIONS'");
  if (res.rows.length > 0) {
    const val = res.rows[0][0];
    console.log(val.length > 6000 ? val.slice(0, 6000) : val);
  } else {
    console.log('NAO ENCONTRADO');
  }
  await conn.close();
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
