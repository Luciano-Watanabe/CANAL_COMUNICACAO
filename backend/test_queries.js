const oracledb = require('oracledb');
require('dotenv').config();

try {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_DIR });
} catch (err) {
    console.error('Erro ao iniciar Oracle Client (Thick Mode):', err);
}

async function run() {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const queryAntes = `
        WITH CLIENTES_PERDIDOS AS (
            SELECT DISTINCT C.CODCLI
            FROM PCCLIENT C
            WHERE C.CODUSUR1 = 45
              AND C.DTULTCOMP >= TRUNC(SYSDATE) - 90
              AND C.DTULTCOMP < TRUNC(SYSDATE, 'MM')
        ),
        PESO_POTENCIAL AS (
            SELECT
                A.CODEPTO,
                ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2) AS PESO_POTENCIAL
            FROM PCMOV A
            JOIN CLIENTES_PERDIDOS P ON P.CODCLI = A.CODCLI
            JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
            WHERE A.CODUSUR = 45
              AND A.CODOPER LIKE 'S%'
              AND A.DTMOV < TRUNC(SYSDATE, 'MM')
              AND EXISTS (
                  SELECT 1 FROM PCEST E
                  WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '1' AND E.QTESTGER > 0
              )
            GROUP BY A.CODEPTO
            HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
        )
        SELECT CODEPTO, PESO_POTENCIAL FROM PESO_POTENCIAL ORDER BY CODEPTO
        `;

        const queryDepois = `
        WITH CLIENTES_PERDIDOS AS (
            SELECT DISTINCT C.CODCLI
            FROM PCCLIENT C
            WHERE C.CODUSUR1 = 45
              AND C.DTULTCOMP >= TRUNC(SYSDATE) - 90
              AND C.DTULTCOMP < TRUNC(SYSDATE, 'MM')
        ),
        PESO_POTENCIAL AS (
            SELECT 
                CODEPTO, 
                ROUND(SUM(AVG_PESO_PRODUTO), 2) AS PESO_POTENCIAL
            FROM (
                SELECT
                    A.CODEPTO,
                    SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / COUNT(A.CODPROD) AS AVG_PESO_PRODUTO
                FROM PCMOV A
                JOIN CLIENTES_PERDIDOS P ON P.CODCLI = A.CODCLI
                JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                WHERE A.CODUSUR = 45
                  AND A.CODOPER LIKE 'S%'
                  AND A.DTMOV < TRUNC(SYSDATE, 'MM')
                  AND EXISTS (
                      SELECT 1 FROM PCEST E
                      WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '1' AND E.QTESTGER > 0
                  )
                GROUP BY A.CODCLI, A.CODEPTO, A.CODPROD
                HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
            )
            GROUP BY CODEPTO
        )
        SELECT CODEPTO, PESO_POTENCIAL FROM PESO_POTENCIAL ORDER BY CODEPTO
        `;

        const resultAntes = await conn.execute(queryAntes, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const resultDepois = await conn.execute(queryDepois, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        console.log("--- RESULTADOS ANTES (Soma) ---");
        console.table(resultAntes.rows);
        
        console.log("\n--- RESULTADOS DEPOIS (Média) ---");
        console.table(resultDepois.rows);

    } catch (e) {
        console.error(e);
    } finally {
        if (conn) await conn.close();
    }
}
run();
