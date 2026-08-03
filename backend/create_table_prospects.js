const oracledb = require('oracledb');
require('dotenv').config();

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

async function run() {
  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    
    console.log('Creating table CANAL_PROSPECTS...');
    await connection.execute(`
      CREATE TABLE CANAL_PROSPECTS (
          ID VARCHAR2(50) DEFAULT RAWTOHEX(SYS_GUID()) PRIMARY KEY,
          NOME_FANTASIA VARCHAR2(255) NOT NULL,
          RAZAO_SOCIAL VARCHAR2(255),
          CNPJ VARCHAR2(20),
          TELEFONE VARCHAR2(100),
          ENDERECO VARCHAR2(500),
          CIDADE VARCHAR2(100),
          ESTADO VARCHAR2(2),
          LATITUDE VARCHAR2(50),
          LONGITUDE VARCHAR2(50),
          ORIGEM VARCHAR2(50),
          RAMO_ATIVIDADE VARCHAR2(100),
          HAS_WHATSAPP VARCHAR2(1) DEFAULT 'P',
          DATA_CADASTRO DATE DEFAULT SYSDATE
      )
    `);
    console.log('Table CANAL_PROSPECTS created.');

    await connection.execute(`CREATE INDEX IDX_PROSPECTS_CNPJ ON CANAL_PROSPECTS (CNPJ)`);
    await connection.execute(`CREATE INDEX IDX_PROSPECTS_CIDADE ON CANAL_PROSPECTS (CIDADE)`);
    console.log('Indexes created.');

  } catch (err) {
    if (err.message.includes('ORA-00955')) {
        console.log('Tabela já existe.');
    } else {
        console.error(err);
    }
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}
run();
