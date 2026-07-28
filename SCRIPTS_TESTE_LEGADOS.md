# Scripts de Teste e Migração Legados

Este arquivo contém o histórico dos scripts de teste, exploração de banco de dados e criações de tabelas usados durante o desenvolvimento do projeto. Os arquivos originais foram consolidados aqui e apagados para manter o repositório limpo.

## check_contatos.txt

```
◇ injected env (0) from .env // tip: ⌘ enable debugging { debug: true }
CONTATOS TEL: [ [ '5512981371613' ], [ '5512981466409' ], [ '5511960846347' ] ]
```

## check_contatos_cols.txt

```
◇ injected env (0) from .env // tip: ⌘ multiple files { path: ['.env.local', '.env'] }
CONTATOS COLUNAS: CODCLI, NOME_CONTATO, TELEFONE, DATA_CADASTRO
```

## check_tokens.js

```javascript
const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
async function run() {
  const connection = await oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASS,
    connectString: process.env.ORACLE_CONN_STR
  });
  const res = await connection.execute(`SELECT * FROM CANAL_TOKENS_EVOLUTION`);
  console.log('Tokens:', res.rows);
  await connection.close();
}
run();
```

## check_webhook.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
(async () => {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT PAYLOAD FROM JCWEBHOOK ORDER BY DATA_HORA DESC FETCH FIRST 3 ROWS ONLY`);
    for(let row of result.rows) {
       console.log(JSON.stringify(JSON.parse(row[0]), null, 2));
    }
    await conn.close();
  } catch(e) { console.error(e); }
})();
```

## check_webhook2.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
(async () => {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT PAYLOAD FROM JCWEBHOOK ORDER BY DATA_HORA DESC FETCH FIRST 2 ROWS ONLY`);
    for(let row of result.rows) {
       console.log(row[0]);
    }
    await conn.close();
  } catch(e) { console.error(e); }
})();
```

## check_webhook3.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
(async () => {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT PAYLOAD FROM JCWEBHOOK WHERE PAYLOAD LIKE '%audioMessage%' ORDER BY DATA_HORA DESC FETCH FIRST 1 ROWS ONLY`);
    for(let row of result.rows) {
       console.log(JSON.stringify(JSON.parse(row[0]), null, 2));
    }
    await conn.close();
  } catch(e) { console.error(e); }
})();
```

## check_webhook4.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
(async () => {
  try {
    const conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    const result = await conn.execute(`SELECT PAYLOAD FROM JCWEBHOOK WHERE PAYLOAD LIKE '%audioMessage%' ORDER BY DATA_HORA DESC FETCH FIRST 1 ROWS ONLY`);
    for(let row of result.rows) {
       console.log(row[0]);
    }
    await conn.close();
  } catch(e) { console.error(e); }
})();
```

## create_table_configuracoes.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });

      let checkSql = `SELECT count(*) as qtd FROM all_tables WHERE table_name = 'CANAL_CONFIGURACOES'`;
      const result = await conn.execute(checkSql);
      
      if (result.rows[0][0] === 0) {
          const createSql = `
              CREATE TABLE CANAL_CONFIGURACOES (
                  CHAVE VARCHAR2(100) NOT NULL PRIMARY KEY,
                  VALOR VARCHAR2(500)
              )
          `;
          await conn.execute(createSql);
          console.log("Tabela CANAL_CONFIGURACOES criada com sucesso!");
      } else {
          console.log("Tabela CANAL_CONFIGURACOES já existe.");
      }
  } catch (err) {
      console.error("Erro ao criar tabela CANAL_CONFIGURACOES:", err);
  } finally {
      if (conn) {
          await conn.close();
      }
  }
}
run();
```

## create_table_contatos.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });

      // Checar se a tabela existe
      let checkSql = `SELECT count(*) as qtd FROM all_tables WHERE table_name = 'CANAL_CONTATOS'`;
      const result = await conn.execute(checkSql);
      
      if (result.rows[0][0] === 0) {
          const createSql = `
              CREATE TABLE CANAL_CONTATOS (
                  CODCLI NUMBER NOT NULL,
                  NOME_CONTATO VARCHAR2(100),
                  TELEFONE VARCHAR2(20) NOT NULL,
                  DATA_CADASTRO DATE DEFAULT SYSDATE
              )
          `;
          await conn.execute(createSql);
          console.log("Tabela CANAL_CONTATOS criada com sucesso!");
      } else {
          console.log("Tabela CANAL_CONTATOS já existe.");
      }
      
  } catch (err) {
      console.error("Erro ao criar tabela:", err);
  } finally {
      if (conn) {
          await conn.close();
      }
  }
}
run();
```

## create_table_mensagens.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });

      let checkSql = `SELECT count(*) as qtd FROM all_tables WHERE table_name = 'CANAL_MENSAGENS'`;
      const result = await conn.execute(checkSql);
      
      if (result.rows[0][0] === 0) {
          const createSql = `
              CREATE TABLE CANAL_MENSAGENS (
                  ID_MENSAGEM VARCHAR2(100) NOT NULL PRIMARY KEY,
                  CODUSUR NUMBER NOT NULL,
                  TELEFONE_CLIENTE VARCHAR2(20) NOT NULL,
                  SENTIDO VARCHAR2(3) NOT NULL CHECK (SENTIDO IN ('IN', 'OUT')),
                  TEXTO VARCHAR2(4000),
                  DATA_HORA DATE DEFAULT SYSDATE
              )
          `;
          await conn.execute(createSql);
          console.log("Tabela CANAL_MENSAGENS criada com sucesso!");
      } else {
          console.log("Tabela CANAL_MENSAGENS já existe.");
      }

      // Tabela para guardar estado do webhook poller
      let checkStateSql = `SELECT count(*) as qtd FROM all_tables WHERE table_name = 'CANAL_WEBHOOK_STATE'`;
      const resultState = await conn.execute(checkStateSql);
      if (resultState.rows[0][0] === 0) {
          const createStateSql = `
              CREATE TABLE CANAL_WEBHOOK_STATE (
                  ID NUMBER NOT NULL PRIMARY KEY,
                  LAST_PROCESSED_ID NUMBER NOT NULL
              )
          `;
          await conn.execute(createStateSql);
          await conn.execute(`INSERT INTO CANAL_WEBHOOK_STATE (ID, LAST_PROCESSED_ID) VALUES (1, 0)`);
          await conn.commit();
          console.log("Tabela CANAL_WEBHOOK_STATE criada com sucesso!");
      } else {
          console.log("Tabela CANAL_WEBHOOK_STATE já existe.");
      }

  } catch (err) {
      console.error("Erro ao criar tabela CANAL_MENSAGENS:", err);
  } finally {
      if (conn) {
          await conn.close();
      }
  }
}
run();
```

## create_table_tokens.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });

      let checkSql = `SELECT count(*) as qtd FROM all_tables WHERE table_name = 'CANAL_TOKENS_EVOLUTION'`;
      const result = await conn.execute(checkSql);
      
      if (result.rows[0][0] === 0) {
          const createSql = `
              CREATE TABLE CANAL_TOKENS_EVOLUTION (
                  CODUSUR NUMBER NOT NULL PRIMARY KEY,
                  API_TOKEN VARCHAR2(500) NOT NULL,
                  INSTANCE_NAME VARCHAR2(100),
                  API_URL VARCHAR2(500),
                  DATA_ATUALIZACAO DATE DEFAULT SYSDATE
              )
          `;
          await conn.execute(createSql);
          console.log("Tabela CANAL_TOKENS_EVOLUTION criada com sucesso!");
      } else {
          console.log("Tabela CANAL_TOKENS_EVOLUTION já existe.");
      }
  } catch (err) {
      console.error("Erro ao criar tabela CANAL_TOKENS_EVOLUTION:", err);
  } finally {
      if (conn) {
          await conn.close();
      }
  }
}
run();
```

## create_view.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    try {
        oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    } catch (e) { }

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
          CREATE OR REPLACE VIEW VW_CANAL_CLIENTES AS
          SELECT 
              C.CODCLI,
              C.CLIENTE,
              C.FANTASIA,
              C.CGCENT AS CNPJ,
              C.TELCELENT AS TELEFONE,
              C.CODUSUR1 AS VENDEDOR_PRINCIPAL,
              C.BLOQUEIO,
              C.LIMCRED AS LIMITE_CREDITO,
              C.CODATV1,
              A.RAMO
          FROM PCCLIENT C
          JOIN PCATIVI A ON A.CODATIV = C.CODATV1
      `;

        await conn.execute(sql);
        console.log("View VW_CANAL_CLIENTES criada com sucesso!");
    } catch (err) {
        console.error("Erro ao criar view:", err);
    } finally {
        if (conn) {
            await conn.close();
        }
    }
}
run();
```

## create_view_usuarios.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });

      const sql = `
          CREATE OR REPLACE VIEW VW_CANAL_USUARIOS AS
          SELECT 
              U.CODUSUR,
              U.NOME,
              U.USURFTP,
              U.SENHAFTP,
              U.TIPOVEND,
              U.CODSUPERVISOR,
              S.NOME AS NOME_SUPERVISOR,
              CASE 
                  WHEN G.CODGERENTE IS NOT NULL THEN 'GERENTE'
                  WHEN S_CHECK.CODSUPERVISOR IS NOT NULL THEN 'SUPERVISOR'
                  ELSE 'VENDEDOR'
              END AS CARGO
          FROM PCUSUARI U
          LEFT JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
          LEFT JOIN PCSUPERV S_CHECK ON U.CODUSUR = S_CHECK.CODSUPERVISOR
          LEFT JOIN PCGERENTE G ON U.CODUSUR = G.CODGERENTE
          WHERE U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL
      `;

      await conn.execute(sql);
      console.log("View VW_CANAL_USUARIOS criada com sucesso!");
  } catch (err) {
      console.error("Erro ao criar view:", err);
  } finally {
      if (conn) {
          await conn.close();
      }
  }
}
run();
```

## test_client.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });

  const res1 = await conn.execute(`SELECT column_name, data_type FROM all_tab_columns WHERE table_name = 'PCCLIENT' AND ROWNUM <= 20`);
  console.log("PCCLIENT Cols:", res1.rows.map(r => r[0]).join(', '));
  
  await conn.close();
}
run();
```

## test_client2.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });

  const res1 = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCCLIENT' AND column_name IN ('CODCLI', 'CLIENTE', 'FANTASIA', 'CODUSUR1', 'CODUSUR2', 'TELEFONEENT', 'CGCENT', 'TELCOB')`);
  console.log("PCCLIENT Cols:", res1.rows.map(r => r[0]).join(', '));
  
  await conn.close();
}
run();
```

## test_client3.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });

  const res1 = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCCLIENT' AND column_name IN ('BLOQUEIO', 'LIMCRED', 'VLLIMCRED', 'BLOQUEIOSEFAZ', 'STATUS')`);
  console.log("PCCLIENT Cols:", res1.rows.map(r => r[0]).join(', '));
  
  await conn.close();
}
run();
```

## test_clientes.json

```json
{"success":true,"clientes":[{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}]}
```

## test_contatos.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
(async function() {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    let c = await oracledb.getConnection({user: process.env.ORACLE_USER, password: process.env.ORACLE_PASS, connectString: process.env.ORACLE_CONN_STR});
    let sql = `
            SELECT DISTINCT CC.CODCLI, CC.NOMECONTATO AS NOME_CONTATO, NVL(CC.TELEFONE, CC.CELULAR) AS TELEFONE, C.CLIENTE, CC.OBS AS TAGS
            FROM PCCONTATO CC
            JOIN PCCLIENT C ON CC.CODCLI = C.CODCLI
            WHERE CC.CODCLI = 7009
    `;
    let res = await c.execute(sql);
    console.log("PCCONTATO JOIN PCCLIENT:", res.rows);
    
    let sql2 = `SELECT COUNT(*) FROM VW_CANAL_CLIENTES WHERE CODCLI = 7009`;
    let res2 = await c.execute(sql2);
    console.log("VW_CANAL_CLIENTES count:", res2.rows);

    await c.close();
})();
```

## test_db.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config({ path: '/opt/CANAL_COMUNICACAO/backend/.env' });
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const result = await conn.execute(`SELECT column_name, data_type FROM user_tab_columns WHERE table_name = 'CANAL_VISITAS'`);
        console.log(result.rows);
    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
        process.exit(0);
    }
}
run();
```

## test_evolution.js

```javascript
const fs = require('fs');
console.log("Just checking fs module is working.");
```

## test_hierarchy.js

```javascript
require('dotenv').config();
const oracledb = require('oracledb');

async function run() {
    try {
        oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
    } catch (err) {}

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Test Supervisor logic
        console.log("Checking Supervisor logic...");
        // Let's get a sample supervisor
        const supRes = await connection.execute(`SELECT COD_CADRCA FROM PCSUPERV WHERE ROWNUM = 1`);
        if (supRes.rows.length > 0) {
            const codusur = supRes.rows[0][0];
            console.log("Found Supervisor CODUSUR:", codusur);
            
            const q = `
                SELECT U.CODUSUR, U.NOME 
                FROM PCUSUARI U
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U.CODSUPERVISOR
                WHERE S.COD_CADRCA = :codusur
            `;
            const vends = await connection.execute(q, { codusur });
            console.log(`Vendedores under supervisor ${codusur}:`, vends.rows);
        }

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.close();
    }
}

run();
```

## test_jcwebhook.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  
  let conn;
  try {
      conn = await oracledb.getConnection({
          user: process.env.ORACLE_USER,
          password: process.env.ORACLE_PASS,
          connectString: process.env.ORACLE_CONN_STR
      });
      // Describe the table
      const result = await conn.execute(`
        SELECT column_name, data_type 
        FROM all_tab_cols 
        WHERE table_name = 'JCWEBHOOK'
      `);
      console.log("COLUMNS:");
      console.log(result.rows);

      // Get 1 row to see the JSON
      const data = await conn.execute(`SELECT * FROM JCWEBHOOK WHERE ROWNUM = 1`);
      console.log("DATA:");
      console.log(data.rows);
  } catch (err) {
      console.error(err);
  } finally {
      if (conn) await conn.close();
  }
}
run();
```

## test_mix.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR || process.env.ORACLE_CONN
  });
  
  const res = await conn.execute(`SELECT table_name FROM all_tables WHERE table_name LIKE '%MIX%' FETCH FIRST 20 ROWS ONLY`);
  console.log("Tabelas MIX:", res.rows.map(r => r[0]));
  await conn.close();
}
run();
```

## test_mix_debug.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  // get a random client with activity
  const resCli0 = await conn.execute(`SELECT CODCLI FROM PCCLIENT WHERE CODATV1 IS NOT NULL FETCH FIRST 1 ROWS ONLY`);
  const codcli = resCli0.rows[0][0];

  const resCli = await conn.execute(`SELECT CODATV1 FROM PCCLIENT WHERE CODCLI = :codcli`, [codcli]);
  console.log("resCli rows:", resCli.rows);
  const codatv1 = resCli.rows[0][0];
  console.log("codatv1:", codatv1);

  const sql = `
            WITH CLIENTES_ATIVIDADE AS (
                SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv1
            ),
            COMPRAS_GERAIS AS (
                SELECT M.CODPROD, SUM(M.QT) AS QTD_TOTAL, COUNT(DISTINCT M.CODCLI) AS QTD_CLIENTES_COMPRARAM
                FROM PCMOV M
                JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
                WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                GROUP BY M.CODPROD
            ),
            COMPRAS_CLIENTE AS (
                SELECT M.CODPROD, SUM(M.QT) AS QTD_CLIENTE, MAX(M.DTMOV) AS ULTIMA_COMPRA
                FROM PCMOV M
                WHERE M.CODCLI = :codcli AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 365
                GROUP BY M.CODPROD
            )
            SELECT 
                CG.CODPROD, 
                P.DESCRICAO,
                NVL(PR.PVENDA, 0) AS PVENDA,
                NVL(CC.QTD_CLIENTE, 0) AS QTD_CLIENTE,
                CC.ULTIMA_COMPRA,
                CG.QTD_TOTAL,
                CG.QTD_CLIENTES_COMPRARAM
            FROM COMPRAS_GERAIS CG
            JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
            LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
            LEFT JOIN COMPRAS_CLIENTE CC ON CC.CODPROD = CG.CODPROD
            ORDER BY CG.QTD_CLIENTES_COMPRARAM DESC
            FETCH FIRST 10 ROWS ONLY
        `;

  const res = await conn.execute(sql, { codatv1, codcli });
  console.log("Mix items:", res.rows.length);
  await conn.close();
}
run();
```

## test_mix_query.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  // get a random client with activity
  const resCli = await conn.execute(`SELECT CODCLI, CODATV1 FROM PCCLIENT WHERE CODATV1 IS NOT NULL FETCH FIRST 1 ROWS ONLY`);
  const codcli = resCli.rows[0][0];
  const codatv = resCli.rows[0][1];
  
  console.log(`Testing with CODCLI=${codcli} CODATV1=${codatv}`);
  
  const sql = `
  WITH CLIENTES_ATIVIDADE AS (
      SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv1
  ),
  COMPRAS_GERAIS AS (
      SELECT M.CODPROD, COUNT(DISTINCT M.CODCLI) AS QTD_CLIENTES_COMPRARAM
      FROM PCMOV M
      JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
      WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
      GROUP BY M.CODPROD
  ),
  COMPRAS_CLIENTE AS (
      SELECT M.CODPROD, SUM(M.QT) AS QTD_CLIENTE, MAX(M.DTMOV) AS ULTIMA_COMPRA
      FROM PCMOV M
      WHERE M.CODCLI = :codcli AND M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 365
      GROUP BY M.CODPROD
  )
  SELECT 
      CG.CODPROD, 
      P.DESCRICAO,
      NVL(CC.QTD_CLIENTE, 0) AS QTD_CLIENTE,
      CC.ULTIMA_COMPRA,
      CG.QTD_CLIENTES_COMPRARAM
  FROM COMPRAS_GERAIS CG
  JOIN PCPRODUT P ON P.CODPROD = CG.CODPROD
  LEFT JOIN COMPRAS_CLIENTE CC ON CC.CODPROD = CG.CODPROD
  ORDER BY CG.QTD_CLIENTES_COMPRARAM DESC
  FETCH FIRST 20 ROWS ONLY
  `;
  const start = Date.now();
  const res = await conn.execute(sql, { codatv1: codatv, codcli: codcli });
  console.log(`Query took ${Date.now() - start}ms`);
  console.log(res.rows);
  await conn.close();
}
run();
```

## test_pcclient.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch(e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  const res1 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCCLIENT' 
    AND column_name LIKE '%ATV%'
  `);
  console.log('PCCLIENT cols:', res1.rows.map(r => r[0]).join(', '));
  
  const res2 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCATIVI' 
  `);
  console.log('PCATIVI cols:', res2.rows.map(r => r[0]).join(', '));

  await conn.close();
  process.exit(0);
}
run();
```

## test_pcpedi.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch(e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  const res1 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCPEDI' 
    AND column_name IN ('NUMPED', 'CODPROD', 'QT', 'PVENDA', 'PTABELA')
  `);
  console.log('PCPEDI cols:', res1.rows.map(r => r[0]).join(', '));
  
  const res2 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCPRODUT' 
    AND column_name IN ('CODPROD', 'DESCRICAO', 'CODEPTO')
  `);
  console.log('PCPRODUT cols:', res2.rows.map(r => r[0]).join(', '));

  const res3 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCDEPTO' 
    AND column_name IN ('CODEPTO', 'DESCRICAO')
  `);
  console.log('PCDEPTO cols:', res3.rows.map(r => r[0]).join(', '));

  await conn.close();
  process.exit(0);
}
run();
```

## test_pcsuperv.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch(e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  const res1 = await conn.execute(`
    SELECT column_name FROM all_tab_columns 
    WHERE table_name = 'PCSUPERV' 
  `);
  console.log('PCSUPERV cols:', res1.rows.map(r => r[0]).join(', '));
  await conn.close();
  process.exit(0);
}
run();
```

## test_pcusuari_cols.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        const result = await connection.execute("SELECT column_name, data_type FROM all_tab_columns WHERE table_name = 'PCUSUARI'");
        console.log(result.rows.map(r => r[0]).filter(c => c.includes('TEL') || c.includes('CEL') || c.includes('SITUACAO') || c.includes('ATIVO')));
    } catch (e) {
        console.error(e);
    } finally {
        if(connection) await connection.close();
    }
}
run();
```

## test_prod.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });

  const res1 = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCEMBALAGEM' AND ROWNUM <= 20`);
  console.log("PCEMBALAGEM:", res1.rows.map(r => r[0]).join(', '));
  
  const res2 = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCPRODFILIAL' AND ROWNUM <= 20`);
  console.log("PCPRODFILIAL:", res2.rows.map(r => r[0]).join(', '));

  await conn.close();
}
run();
```

## test_prod_cols.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  const res = await conn.execute(`SELECT column_name FROM all_tab_cols WHERE table_name = 'PCPRODUT' AND column_name LIKE 'P%' FETCH FIRST 20 ROWS ONLY`);
  console.log(res.rows.map(r => r[0]));
  await conn.close();
}
run();
```

## test_qr.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config({ path: './backend/.env' });

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE ROWNUM = 1
        `;
        const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) return console.log('No config');

        const row = result.rows[0];
        let urlBase = row.URL_BASE;
        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        
        console.log('Testing V2 connect...');
        let res = await fetch(`${urlBase}/instance/connect`, {
            method: 'POST',
            headers: { 
                apikey: row.API_TOKEN,
                instance: row.INSTANCE_NAME,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        console.log(res.status);
        console.log(await res.json());

        console.log('Testing V1 connect...');
        res = await fetch(`${urlBase}/instance/connect/${row.INSTANCE_NAME}`, {
            method: 'GET',
            headers: { apikey: row.API_TOKEN }
        });
        console.log(res.status);
        console.log(await res.json());

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.close();
    }
}
run();
```

## test_qr2.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config({ path: './backend/.env' });

async function run() {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            SELECT 
                T.INSTANCE_NAME, 
                T.API_TOKEN, 
                COALESCE(T.API_URL, G.VALOR) AS URL_BASE
            FROM CANAL_TOKENS_EVOLUTION T
            LEFT JOIN CANAL_CONFIGURACOES G ON G.CHAVE = 'EVOLUTION_API_URL'
            WHERE ROWNUM = 1
        `;
        const result = await connection.execute(sql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if (result.rows.length === 0) return console.log('No config');

        const row = result.rows[0];
        let urlBase = row.URL_BASE;
        if (urlBase.endsWith('/')) urlBase = urlBase.slice(0, -1);
        
        console.log('Testing V2 connect...');
        let res = await fetch(`${urlBase}/instance/connect`, {
            method: 'POST',
            headers: { 
                apikey: row.API_TOKEN,
                instance: row.INSTANCE_NAME,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
        
        console.log(res.status);
        console.log(await res.json());

        console.log('Testing V1 connect...');
        res = await fetch(`${urlBase}/instance/connect/${row.INSTANCE_NAME}`, {
            method: 'GET',
            headers: { apikey: row.API_TOKEN }
        });
        console.log(res.status);
        console.log(await res.json());

    } catch (e) {
        console.error(e);
    } finally {
        if (connection) await connection.close();
    }
}
run();
```

## test_query.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}

  let connection;
  try {
    connection = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });

    console.log("Conectado ao Oracle!");

    const tables = ['PCUSUARI', 'PCSUPERV', 'PCGERENTE'];
    for (const table of tables) {
      console.log(`\n--- Estrutura de ${table} ---`);
      try {
        const result = await connection.execute(
          `SELECT column_name, data_type 
           FROM all_tab_columns 
           WHERE table_name = '${table}' 
           ORDER BY column_id`
        );
        console.log(result.rows.map(r => `${r[0]} (${r[1]})`).slice(0, 15).join(', '));
      } catch (err) {
        console.error(`Erro ao consultar ${table}:`, err.message);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        console.error(err);
      }
    }
  }
}

run();
```

## test_query2.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();

async function run() {
  try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
  } catch (e) {}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });

  const res = await conn.execute(`SELECT column_name FROM all_tab_columns WHERE table_name = 'PCUSUARI'`);
  console.log(res.rows.map(r => r[0]).join(', '));
  await conn.close();
}
run();
```

## test_tables.txt

```
◇ injected env (0) from .env // tip: ◈ encrypted .env [www.dotenvx.com]
Exists CANAL_CONTATOS? 1
Tables like PCCONTAT: 2
[ [ 'PCCONTATO' ], [ 'PCCONTATOFV' ] ]
```

## test_tabpr_cols.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  
  const res = await conn.execute(`SELECT column_name FROM all_tab_cols WHERE table_name = 'PCTABPR' AND column_name LIKE 'P%' FETCH FIRST 20 ROWS ONLY`);
  console.log(res.rows.map(r => r[0]));
  await conn.close();
}
run();
```

## test_webhook_json.js

```javascript
const oracledb = require('oracledb');
require('dotenv').config();
async function run() {
  try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch(e){}
  let conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
  });
  const data = await conn.execute(`
    SELECT ID, CONTEUDO 
    FROM JCWEBHOOK 
    WHERE ORIGEM = 'whats'
    ORDER BY ID DESC 
    FETCH FIRST 1 ROWS ONLY
  `);
  if (data.rows.length > 0) {
    const clob = data.rows[0][1];
    let str = "";
    if (clob) str = await clob.getData();
    console.log("LAST WEBHOOK:", str);
  } else {
    console.log("No webhooks found");
  }
  await conn.close();
}
run();
```

