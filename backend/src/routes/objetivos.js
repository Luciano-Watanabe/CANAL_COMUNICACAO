const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { gerarImagemMetas } = require('../services/metasImageService');
const WebhookPoller = require('../services/webhookPoller');

// Função extraída para buscar dados e gerar o PDF
async function gerarPdfObjetivos(codvendedor, conn) {
    // 1. Busca metas e realizado
    const sql = `
        WITH CLIENTES_PERDIDOS AS (
            SELECT C.CODCLI
            FROM PCCLIENT C
            WHERE C.CODUSUR1 = :codvendedor
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
            WHERE A.CODUSUR = :codvendedor
              AND A.CODOPER LIKE 'S%'
              AND A.DTMOV < TRUNC(SYSDATE, 'MM')
              AND EXISTS (
                  SELECT 1 FROM PCEST E
                  WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0
              )
            GROUP BY A.CODEPTO
            HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
        )
        SELECT
            TO_CHAR(A.DTMOV, 'MM/YYYY')  AS MES_REF,
            A.CODUSUR,
            A.CODEPTO,
            C.DESCRICAO,
            ROUND((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / B.QTPESOPREV) * 100, 2) AS PERC_FEITO,
            ROUND(B.QTPESOPREV, 2)                                   AS META,
            ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2)                          AS REALIZADO,
            ROUND(B.QTPESOPREV - SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2)          AS FALTA,
            NVL(P.PESO_POTENCIAL, 0)                                  AS PESO_POTENCIAL,
            ROUND(((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) + NVL(P.PESO_POTENCIAL, 0)) / B.QTPESOPREV) * 100, 2) AS PERC_POTENCIAL,
            CASE
                WHEN NVL(P.PESO_POTENCIAL, 0) > 0 THEN
                    ROUND(
                        ((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) + NVL(P.PESO_POTENCIAL, 0)) / B.QTPESOPREV) * 100
                        - (SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / B.QTPESOPREV) * 100,
                        2
                    )
                ELSE NULL
            END AS GANHO
        FROM PCMOV A
        JOIN PCMETA B  ON A.CODEPTO = B.CODIGO AND A.CODUSUR = B.CODUSUR
        JOIN PCDEPTO C ON A.CODEPTO = C.CODEPTO
        LEFT JOIN PESO_POTENCIAL P ON A.CODEPTO = P.CODEPTO
        JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
        WHERE A.CODUSUR = :codvendedor
          AND A.CODOPER LIKE 'S%'
          AND A.DTMOV >= TRUNC(SYSDATE, 'MM')
          AND A.DTMOV <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
          AND B.DATA  >= TRUNC(SYSDATE, 'MM')
          AND B.DATA  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
        GROUP BY
            A.CODUSUR, A.CODEPTO, TO_CHAR(A.DTMOV, 'MM/YYYY'),
            B.QTPESOPREV, C.DESCRICAO, P.PESO_POTENCIAL
        ORDER BY A.CODEPTO
    `;
    const result = await conn.execute(sql, { codvendedor });

    let mesRef = new Date().toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
    let rowsData = [];
    
    if (result.rows.length > 0) {
        mesRef = result.rows[0][0];
        rowsData = result.rows.map(row => ({
            codepto:        parseInt(row[2])    || 0,
            descricao:      String(row[3] || ''),
            percFeito:      parseFloat(row[4])  || 0,
            meta:           parseFloat(row[5])  || 0,
            realizado:      parseFloat(row[6])  || 0,
            falta:          parseFloat(row[7])  || 0,
            pesoPotencial:  parseFloat(row[8])  || 0,
            percPotencial:  parseFloat(row[9])  || 0,
            ganho:          row[10] != null ? parseFloat(row[10]) : null,
        }));
    }

    // 2. Busca clientes com peso potencial
    const sqlClientes = `
        SELECT
            C.CODCLI,
            NVL(C.FANTASIA, C.CLIENTE)                        AS CLIENTE,
            C.CGCENT,
            TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY')               AS DTULTCOMP,
            A.CODEPTO,
            D.DESCRICAO,
            ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2)                  AS PESO
        FROM PCCLIENT C
        JOIN PCMOV A
            ON A.CODCLI = C.CODCLI
           AND A.CODUSUR = :codvendedor
           AND A.CODOPER LIKE 'S%'
           AND A.DTMOV < TRUNC(SYSDATE, 'MM')
        JOIN PCDEPTO D ON D.CODEPTO = A.CODEPTO
        JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
        WHERE C.CODUSUR1 = :codvendedor
          AND C.DTULTCOMP >= TRUNC(SYSDATE) - 90
          AND C.DTULTCOMP <  TRUNC(SYSDATE, 'MM')
          AND EXISTS (
              SELECT 1 FROM PCEST E
              WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0
          )
        GROUP BY
            C.CODCLI, NVL(C.FANTASIA, C.CLIENTE), C.CGCENT,
            TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY'), A.CODEPTO, D.DESCRICAO
        HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
        ORDER BY C.CODCLI, A.CODEPTO
    `;
    const resClientes = await conn.execute(sqlClientes, { codvendedor });
    const rowsClientes = resClientes.rows.map(r => ({
        codcli:    r[0],
        cliente:   r[1],
        cgcent:    r[2],
        dtultcomp: r[3],
        codepto:   r[4],
        descricao: r[5],
        peso:      r[6],
    }));

    // 3. Nome do vendedor
    let nomeVendedor = '';
    try {
        const resNome = await conn.execute(
            `SELECT NOME FROM PCUSUARI WHERE CODUSUR = :codvendedor`,
            { codvendedor }
        );
        if (resNome.rows.length > 0) nomeVendedor = String(resNome.rows[0][0] || '');
    } catch (e) {}

    // 4. KPIs derivados
    let diasRestantes = 0, diasCorridos = 1, diasTotais = 1;
    let ativosNoMes   = 0, totalCarteira = 0;
    try {
        const resDias = await conn.execute(`
            SELECT
                (SELECT COUNT(*) FROM (
                    SELECT TRUNC(SYSDATE) + LEVEL AS DIA FROM DUAL
                    CONNECT BY TRUNC(SYSDATE) + LEVEL <= LAST_DAY(TRUNC(SYSDATE))
                ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                        NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_RESTANTES,
                (SELECT COUNT(*) FROM (
                    SELECT TRUNC(SYSDATE,'MM') - 1 + LEVEL AS DIA FROM DUAL
                    CONNECT BY TRUNC(SYSDATE,'MM') - 1 + LEVEL <= TRUNC(SYSDATE)
                ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                        NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_CORRIDOS,
                (SELECT COUNT(*) FROM (
                    SELECT TRUNC(SYSDATE,'MM') - 1 + LEVEL AS DIA FROM DUAL
                    CONNECT BY TRUNC(SYSDATE,'MM') - 1 + LEVEL <= LAST_DAY(TRUNC(SYSDATE))
                ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                        NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_TOTAIS,
                (SELECT COUNT(DISTINCT M.CODCLI)
                 FROM PCMOV M
                 WHERE M.CODUSUR = :codvendedor
                   AND M.CODOPER LIKE 'S%'
                   AND M.DTMOV >= TRUNC(SYSDATE, 'MM')
                   AND M.DTMOV <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)) AS ATIVOS_MES,
                (SELECT COUNT(*)
                 FROM PCCLIENT
                 WHERE CODUSUR1 = :codvendedor)                          AS TOTAL_CARTEIRA
            FROM DUAL
        `, { codvendedor });
        if (resDias.rows.length > 0) {
            diasRestantes = parseInt(resDias.rows[0][0]) || 0;
            diasCorridos  = parseInt(resDias.rows[0][1]) || 1;
            diasTotais    = parseInt(resDias.rows[0][2]) || 1;
            ativosNoMes   = parseInt(resDias.rows[0][3]) || 0;
            totalCarteira = parseInt(resDias.rows[0][4]) || 0;
        }
    } catch (e) {}

    let realizadoMesAnt = 0, metaMesAnt = 0;
    try {
        const resMesAnt = await conn.execute(`
            SELECT
                NVL((SELECT ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2) FROM PCMOV A
                     JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                     WHERE A.CODUSUR = :codvendedor AND A.CODOPER LIKE 'S%'
                       AND A.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-1)
                       AND A.DTMOV <  TRUNC(SYSDATE,'MM')), 0) AS REAL_ANT,
                NVL((SELECT ROUND(SUM(B.QTPESOPREV), 2) FROM PCMETA B
                     WHERE B.CODUSUR = :codvendedor
                       AND B.DATA >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-1)
                       AND B.DATA <  TRUNC(SYSDATE,'MM')), 0)  AS META_ANT
            FROM DUAL
        `, { codvendedor });
        if (resMesAnt.rows.length > 0) {
            realizadoMesAnt = parseFloat(resMesAnt.rows[0][0]) || 0;
            metaMesAnt      = parseFloat(resMesAnt.rows[0][1]) || 0;
        }
    } catch (e) {}

    const totalRealizado = rowsData.reduce((s, r) => s + r.realizado, 0);
    const totalMeta      = rowsData.reduce((s, r) => s + r.meta,      0);
    const totalFalta     = Math.max(0, totalMeta - totalRealizado);
    const kgDiaNecessario = diasRestantes > 0 ? totalFalta / diasRestantes : 0;
    const projecaoKg     = (diasCorridos > 0 ? totalRealizado / diasCorridos : 0) * diasTotais;
    const projecaoPerc   = totalMeta > 0 ? (projecaoKg / totalMeta) * 100 : 0;
    const percMesAnt     = metaMesAnt > 0 ? (realizadoMesAnt / metaMesAnt) * 100 : null;

    const resumo = {
        diasRestantes,
        diasCorridos,
        diasTotais,
        kgDiaNecessario,
        ativosNoMes,
        totalCarteira,
        projecaoPerc,
        percMesAnt,
    };

    // 5. Objetivos diários
    let rowsObjetivos = [];
    try {
        const sqlObjetivos = `
            WITH CALENDAR AS (
                SELECT TRUNC(SYSDATE, 'MM') + LEVEL - 1 AS DATA
                FROM DUAL
                CONNECT BY TRUNC(SYSDATE, 'MM') + LEVEL - 1 < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
            )
            SELECT 
                TO_CHAR(C.DATA, 'DD/MM/YYYY') AS DATA,
                CASE 
                    WHEN NVL(SUM(B.VLTOTAL), 0) > 0 AND NVL(A.VLVENDAPREV, 0) = 0 THEN 1
                    ELSE NVL(A.VLVENDAPREV, 0)
                END AS OBJETIVO,
                NVL(SUM(B.VLTOTAL), 0) AS FEITO,
                ROUND(
                    (NVL(SUM(B.VLTOTAL), 0) / 
                    NULLIF(
                        CASE 
                            WHEN NVL(SUM(B.VLTOTAL), 0) > 0 AND NVL(A.VLVENDAPREV, 0) = 0 THEN 1
                            ELSE NVL(A.VLVENDAPREV, 0)
                        END, 0
                    )) * 100, 2
                ) AS PERC
            FROM CALENDAR C
            LEFT JOIN PCMETARCA A ON C.DATA = A.DATA AND A.CODUSUR = :codvendedor
            LEFT JOIN PCNFSAID B ON C.DATA = B.DTSAIDA AND B.CODUSUR = :codvendedor
            GROUP BY C.DATA, A.VLVENDAPREV
            ORDER BY C.DATA
        `;
        const resObj = await conn.execute(sqlObjetivos, { codvendedor });
        rowsObjetivos = resObj.rows.map(r => ({
            data: r[0],
            objetivo: parseFloat(r[1]) || 0,
            feito: parseFloat(r[2]) || 0,
            perc: r[3] != null ? parseFloat(r[3]) : 0
        }));
    } catch (e) {}

    // 6. Gerar Imagem/PDF base64
    const base64Pdf = await gerarImagemMetas(mesRef, rowsData, rowsClientes, nomeVendedor, resumo, rowsObjetivos);
    return { base64Pdf, mesRef, nomeVendedor };
}

// GET /api/objetivos/gerar/:codusur - Retorna o Base64 do PDF
router.get('/gerar/:codusur', async (req, res) => {
    let conn;
    try {
        const codusur = req.params.codusur;
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const { base64Pdf, mesRef } = await gerarPdfObjetivos(codusur, conn);

        res.json({ success: true, base64Pdf, filename: `objetivos_${mesRef.replace('/', '_')}.pdf` });
    } catch (err) {
        console.error('Erro ao gerar PDF de objetivos:', err);
        res.status(500).json({ success: false, error: 'Erro interno ao gerar objetivos.' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});

// POST /api/objetivos/enviar - Gera e envia o PDF para vendedores selecionados
router.post('/enviar', async (req, res) => {
    const { codvendedores } = req.body; // Array de IDs
    if (!codvendedores || !codvendedores.length) {
        return res.status(400).json({ success: false, error: 'Nenhum vendedor selecionado.' });
    }

    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const poller = new WebhookPoller();
        let enviados = 0;
        let erros = 0;

        for (const codvendedor of codvendedores) {
            try {
                // Pega telefone do vendedor e a instância do bot
                const resUser = await conn.execute(`
                    SELECT TELEFONE1 FROM PCUSUARI 
                    WHERE CODUSUR = :codvendedor AND TELEFONE1 IS NOT NULL
                `, { codvendedor });

                if (resUser.rows.length === 0) {
                    erros++;
                    continue;
                }
                const telefone = resUser.rows[0][0].replace(/[^0-9]/g, '');

                // Descobre a instância do BOT (pode usar o BOT_GESTOR ou o primeiro bot de vendedor)
                // Se houver um vendedor, preferimos enviar pelo bot que ele usa, ou o BOT_GESTOR
                const resInst = await conn.execute(`
                    SELECT INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION 
                    WHERE (CODUSUR = :codvendedor OR INSTANCE_NAME LIKE '%BOT_GESTOR%')
                    ORDER BY CASE WHEN INSTANCE_NAME LIKE '%BOT_GESTOR%' THEN 1 ELSE 2 END
                    FETCH FIRST 1 ROWS ONLY
                `, { codvendedor });

                if (resInst.rows.length === 0) {
                    erros++;
                    continue;
                }
                const instanceName = resInst.rows[0][0];

                const { base64Pdf, mesRef } = await gerarPdfObjetivos(codvendedor, conn);

                const fileName = `objetivos_${mesRef.replace('/', '_')}.pdf`;
                
                // Dispara o envio
                await poller.enviarDocumentoBot(telefone, base64Pdf, fileName, 'application/pdf', conn, instanceName);
                enviados++;
            } catch (err) {
                console.error(`Erro ao enviar objetivos para vendedor ${codvendedor}:`, err);
                erros++;
            }
        }

        res.json({ success: true, message: `Enviados: ${enviados}, Erros: ${erros}` });
    } catch (err) {
        console.error('Erro ao processar envio em lote:', err);
        res.status(500).json({ success: false, error: 'Erro interno ao processar envios.' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});

module.exports = router;
