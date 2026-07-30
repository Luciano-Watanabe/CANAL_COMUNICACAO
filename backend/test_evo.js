const axios = require('axios');
const oracledb = require('oracledb');
try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) { console.error('Oracle client init error:', err); }

async function test() {
  let connection;
  try {
    connection = await oracledb.getConnection({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASS,
        connectString: process.env.ORACLE_CONN_STR
    });
    const { rows } = await connection.execute(`
        SELECT 
            T.INSTANCE_NAME, 
            T.API_TOKEN, 
            COALESCE(T.API_URL, G.VALOR) AS URL_BASE
        FROM CANAL_TOKENS_EVOLUTION T
        LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
        WHERE ROWNUM = 1
    `, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    if(rows.length > 0) {
       const urlBase = rows[0].URL_BASE;
       const apiToken = rows[0].API_TOKEN;
       const instanceName = rows[0].INSTANCE_NAME;
       
       console.log('urlBase:', urlBase, 'apiToken:', apiToken, 'instanceName:', instanceName);
       console.log('Testing Evolution Go /user/check...');
       try {
           const url = `${urlBase}/user/check`;
           const res = await axios.post(url, { number: ["5511999999999"] }, { 
               headers: { 
                   apikey: apiToken,
                   instance: instanceName
               }
           });
           console.log(res.data);
       } catch(e) {
           console.error('check error:', e.message, e.response?.data);
       }
    }
  } catch(e) {
    console.error(e);
  } finally {
      if(connection) await connection.close();
  }
}
test();
