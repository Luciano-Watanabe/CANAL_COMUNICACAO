const oracledb = require('oracledb');
oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
(async () => {
  const conn = await oracledb.getConnection({
    user: 'AGDIST', password: 'AGDIST', connectString: '172.16.5.12:1521/WINT'
  });

  const pk = await conn.execute(`SELECT c1.TABLE_NAME, c1.CONSTRAINT_NAME, c1.COLUMN_NAME, c1.POSITION
    FROM ALL_CONS_COLUMNS c1
    JOIN ALL_CONSTRAINTS c ON c1.CONSTRAINT_NAME = c.CONSTRAINT_NAME AND c1.OWNER = c.OWNER
    WHERE c1.TABLE_NAME = 'CANAL_TOKENS_EVOLUTION' AND c.CONSTRAINT_TYPE = 'P'
    ORDER BY c1.POSITION`);
  console.log('PK_TOKENS:', pk.rows);

  const dts = await conn.execute(`SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME IN ('CANAL_MENSAGENS','CANAL_TOKENS_EVOLUTION')
    AND COLUMN_NAME IN ('TEXTO','MEDIA_URL','DATA_HORA','INSTANCE_NAME','CODUSUR','TELEFONE_CLIENTE')`);
  console.log('TIPOS:', JSON.stringify(dts.rows));

  const sql = `
    SELECT
        m.TELEFONE_CLIENTE,
        m.CODUSUR,
        NVL(t.NOME_ATENDENTE, u.NOME) AS NOME_CONTA,
        NVL(t.INSTANCE_NAME, 'SEM-INSTANCIA') AS INSTANCE_NAME,
        MAX(m.DATA_HORA) AS ULTIMA_MENSAGEM,
        (SELECT m2.TEXTO FROM CANAL_MENSAGENS m2 WHERE m2.TELEFONE_CLIENTE = m.TELEFONE_CLIENTE AND m2.CODUSUR = m.CODUSUR ORDER BY m2.DATA_HORA DESC FETCH FIRST 1 ROWS ONLY) AS PREVIEW
    FROM CANAL_MENSAGENS m
    LEFT JOIN CANAL_TOKENS_EVOLUTION t ON t.CODUSUR = m.CODUSUR
    LEFT JOIN PCUSUARI u ON u.CODUSUR = m.CODUSUR
    GROUP BY m.TELEFONE_CLIENTE, m.CODUSUR, NVL(t.NOME_ATENDENTE, u.NOME), NVL(t.INSTANCE_NAME, 'SEM-INSTANCIA')
    ORDER BY MAX(m.DATA_HORA) DESC
  `;
  const r1 = await conn.execute(sql);
  console.log('COUNT_TODAS_CONVERSAS:', r1.rows.length);
  console.log('EXEMPLOS:', JSON.stringify(r1.rows.slice(0, 3)));

  const r2 = await conn.execute(`SELECT ID_MENSAGEM, SENTIDO, SUBSTR(TEXTO,1,60), TO_CHAR(DATA_HORA,'DD/MM/YYYY HH24:MI'), MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE
    FROM CANAL_MENSAGENS WHERE ROWNUM <= 3 ORDER BY DATA_HORA DESC`);
  console.log('AMOSTRA_MENSAGENS:', JSON.stringify(r2.rows));

  await conn.close();
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
