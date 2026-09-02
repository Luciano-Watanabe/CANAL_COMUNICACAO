const oracledb = require('oracledb');
oracledb.fetchAsString = [oracledb.CLOB];
try { oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' }); } catch (e) { console.log('initOracleClient:', e.message); }

async function main() {
  let conn;
  try {
    conn = await oracledb.getConnection({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASS,
      connectString: process.env.ORACLE_CONN_STR
    });
    console.log('CONNECTED');

    // 1. PK da tabela
    const pk = await conn.execute(
      `SELECT c.CONSTRAINT_NAME, c.CONSTRAINT_TYPE
         FROM ALL_CONSTRAINTS c
        WHERE c.TABLE_NAME = 'CANAL_TOKENS_EVOLUTION'
          AND c.CONSTRAINT_TYPE = 'P'`
    );
    console.log('PK:', JSON.stringify(pk.rows));

    const pkCols = await conn.execute(
      `SELECT cc.CONSTRAINT_NAME, cc.COLUMN_NAME, cc.POSITION
         FROM ALL_CONS_COLUMNS cc
        WHERE cc.TABLE_NAME = 'CANAL_TOKENS_EVOLUTION'
        ORDER BY cc.POSITION`
    );
    console.log('CONS_COLS:', JSON.stringify(pkCols.rows));

    // FK referencing
    const refs = await conn.execute(
      `SELECT CONSTRAINT_NAME, TABLE_NAME FROM ALL_CONSTRAINTS
        WHERE R_CONSTRAINT_NAME IN (
          SELECT CONSTRAINT_NAME FROM ALL_CONSTRAINTS WHERE TABLE_NAME='CANAL_TOKENS_EVOLUTION' AND CONSTRAINT_TYPE='P'
        )`
    );
    console.log('REFS_TO_PK:', JSON.stringify(refs.rows));

    // 2. Rows count + sample
    const cnt = await conn.execute(`SELECT COUNT(*) FROM CANAL_TOKENS_EVOLUTION`);
    console.log('ROWS:', cnt.rows[0][0]);
    const sample = await conn.execute(`SELECT CODUSUR, INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION WHERE ROWNUM <= 5`);
    console.log('SAMPLE:', JSON.stringify(sample.rows));

    // 3. VW_CANAL_USUARIOS CARGO values
    const cargos = await conn.execute(`SELECT DISTINCT CARGO FROM VW_CANAL_USUARIOS`);
    console.log('VW_CARGO_VALUES:', JSON.stringify(cargos.rows));

    // 4. Match token rows -> cargo in view
    const match = await conn.execute(`
      SELECT V.CARGO, COUNT(*) FROM VW_CANAL_USUARIOS V
      JOIN CANAL_TOKENS_EVOLUTION T ON T.CODUSUR = V.CODUSUR
      GROUP BY V.CARGO
    `);
    console.log('MATCH_BY_CARGO:', JSON.stringify(match.rows));

    // 5. Token rows not in view
    const noMatch = await conn.execute(`
      SELECT COUNT(*) FROM CANAL_TOKENS_EVOLUTION T
      WHERE NOT EXISTS (SELECT 1 FROM VW_CANAL_USUARIOS V WHERE V.CODUSUR = T.CODUSUR)
    `);
    console.log('TOKEN_ROWS_NOT_IN_VIEW:', noMatch.rows[0][0]);

  } catch (e) {
    console.error('FATAL', e);
  } finally {
    if (conn) { try { await conn.close(); } catch (e) {} }
  }
}
main().catch(e => { console.error('FATAL2', e); process.exit(1); });
