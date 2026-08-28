const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
const { initPool, getConnection } = require('./src/services/oraclePool');
require('dotenv').config({ path: '/app/.env' });

async function run() {
  await initPool();
  const conn = await getConnection();
  try {
    const res = await conn.execute("SELECT * FROM CANAL_USO_IA WHERE ROWNUM = 1");
    console.log("CANAL_USO_IA exists!");
  } catch (e) {
    console.error("Error querying CANAL_USO_IA:", e.message);
  }
  
  try {
    const res2 = await conn.execute("SELECT * FROM CANAL_SAC_ACESSOS WHERE ROWNUM = 1");
    console.log("CANAL_SAC_ACESSOS exists!");
  } catch (e) {
    console.error("Error querying CANAL_SAC_ACESSOS:", e.message);
  }
  
  if (conn) await conn.close();
  process.exit(0);
}
run();
