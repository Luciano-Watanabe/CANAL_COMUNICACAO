const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
const { initPool, getConnection } = require('./src/services/oraclePool');
require('dotenv').config({ path: '/app/.env' });

async function run() {
  await initPool();
  const conn = await getConnection();
  try {
    const res = await conn.execute("SELECT TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME = 'CANAL_USO_IA'");
    if (res.rows.length === 0) {
      console.log('Creating table CANAL_USO_IA...');
      await conn.execute(`
        CREATE TABLE CANAL_USO_IA (
          ID NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          DATA_HORA DATE DEFAULT SYSDATE,
          ATENDENTE VARCHAR2(100),
          ORIGEM VARCHAR2(50),
          SUCESSO VARCHAR2(1) DEFAULT 'S'
        )
      `);
      console.log('Table CANAL_USO_IA created.');
    } else {
      console.log('Table CANAL_USO_IA already exists.');
    }

    // Insert dummy configuration keys for limits if they don't exist
    const keys = ['IA_LIMITE_DIARIO', 'IA_LIMITE_SEMANAL', 'IA_LIMITE_MENSAL'];
    for (const k of keys) {
      const kRes = await conn.execute(`SELECT 1 FROM CANAL_CONFIGURACOES WHERE CHAVE = :k`, { k });
      if (kRes.rows.length === 0) {
        let val = '0';
        if (k === 'IA_LIMITE_DIARIO') val = '500';
        if (k === 'IA_LIMITE_SEMANAL') val = '3500';
        if (k === 'IA_LIMITE_MENSAL') val = '15000';
        await conn.execute(`INSERT INTO CANAL_CONFIGURACOES (CHAVE, VALOR) VALUES (:k, :val)`, { k, val }, { autoCommit: true });
        console.log(`Inserted ${k} = ${val}`);
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (conn) await conn.close();
    process.exit(0);
  }
}
run();
