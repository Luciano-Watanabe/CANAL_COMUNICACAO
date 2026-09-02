require('dotenv').config();
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({ user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR });
  try {
    const tok = await conn.execute(`SELECT CODUSUR, INSTANCE_NAME, STATUS, NOME_ATENDENTE, CARGO FROM CANAL_TOKENS_EVOLUTION ORDER BY INSTANCE_NAME`);
    console.log('=== INSTANCES ===');
    tok.rows.forEach(r => console.log(String(r[0]).padEnd(10), String(r[1]).padEnd(22), String(r[2]).padEnd(10), String(r[3]||'').padEnd(20), r[4]||''));

    const cfg = await conn.execute(`SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('EVOLUTION_API_URL','GROQ_API_KEY')`);
    console.log('=== CONFIG ===');
    cfg.rows.forEach(r => console.log(String(r[0]).padEnd(22), String(r[1]).substring(0,30)+'...'));

    const sample = await conn.execute(`SELECT * FROM (SELECT ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, SUBSTR(TEXTO,1,60) TXT, TO_CHAR(DATA_HORA,'DD/MM HH24:MI') DH, MEDIA_URL, MEDIA_TYPE, ARQUIVO_LOCAL FROM CANAL_MENSAGENS WHERE MEDIA_URL IS NOT NULL ORDER BY DATA_HORA DESC) WHERE ROWNUM <= 15`);
    console.log('=== SAMPLE MEDIA MSG ===');
    sample.rows.forEach(r => console.log(String(r[0]).padEnd(30), String(r[1]).padEnd(6), String(r[2]).padEnd(16), String(r[3]).padEnd(4), String(r[4]||'').padEnd(35), String(r[5]).padEnd(12), String(r[6]||'').padEnd(40), String(r[7]||'').padEnd(8), r[8]||''));

    const cnt = await conn.execute(`SELECT MEDIA_TYPE, COUNT(*) FROM CANAL_MENSAGENS GROUP BY MEDIA_TYPE`);
    console.log('=== COUNT BY MEDIA_TYPE ===');
    cnt.rows.forEach(r => console.log(String(r[0]||'null').padEnd(16), r[1]));
  } catch (e) { console.error('ERR', e.message); }
  await conn.close();
  process.exit(0);
})();
