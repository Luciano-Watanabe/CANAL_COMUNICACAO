const axios = require('axios');
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO_HOMOLOGACAO/.env' });

async function run() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute("SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROK_API_KEY'");
    const key = result.rows.length > 0 ? result.rows[0][0] : process.env.GROK_API_KEY;
    
    if (!key) {
        console.log("No GROK API key found");
        return;
    }

    try {
        const res = await axios.get('https://api.x.ai/v1/models', {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        console.log("Models:", res.data.data.map(m => m.id));
    } catch(err) {
        console.error("API Error:", err.response ? err.response.data : err.message);
    }
  } catch(e) { console.error(e); } finally { if (conn) await conn.close(); process.exit(0); }
}
run();
