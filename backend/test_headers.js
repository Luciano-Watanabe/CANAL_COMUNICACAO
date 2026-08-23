const axios = require('axios');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });

async function run() {
  const conn = await oracledb.getConnection({
    user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR
  });
  const res = await conn.execute("SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('GROK_API_KEY', 'GROQ_API_KEY')");
  let grokKey = '', groqKey = '';
  res.rows.forEach(r => { if(r[0]==='GROK_API_KEY') grokKey=r[1]; if(r[0]==='GROQ_API_KEY') groqKey=r[1]; });

  console.log('--- GROQ ---');
  try {
    const groqRes = await axios.get('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': `Bearer ${groqKey}` } });
    console.log(groqRes.headers);
  } catch(e) { console.log(e.response ? e.response.headers : e.message); }

  console.log('--- X.AI (GROK) ---');
  try {
    const grokRes = await axios.get('https://api.x.ai/v1/models', { headers: { 'Authorization': `Bearer ${grokKey}` } });
    console.log(grokRes.headers);
  } catch(e) { console.log(e.response ? e.response.headers : e.message); }
  
  process.exit(0);
}
run();
