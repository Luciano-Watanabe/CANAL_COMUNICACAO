const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// Buscar Lista de Atividades
router.get('/atividades', async (req, res) => {
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });
        
        // Retorna apenas atividades que possuem clientes vinculados
        const sql = `
            SELECT A.CODATIV, A.RAMO 
            FROM PCATIVI A
            WHERE EXISTS (SELECT 1 FROM PCCLIENT C WHERE C.CODATV1 = A.CODATIV)
            ORDER BY A.RAMO
        `;
        const result = await conn.execute(sql);
        
        const atividades = result.rows.map(row => ({
            codatv: row[0] ?? row.CODATIV,
            ramo: row[1] ?? row.RAMO
        }));
        
        res.json({ success: true, atividades });
    } catch (err) {
        console.error('[CATALOGO] Erro ao buscar atividades:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar atividades' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

// Buscar Produtos do Catálogo (Opcionalmente filtrado por Atividade)
router.get('/produtos', async (req, res) => {
    const { codatv1 } = req.query;
    let conn;
    try {
        conn = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let withClause = '';
        let joinClause = '';
        let whereClause = '';
        let binds = {};

        if (codatv1 && codatv1 !== 'null' && codatv1 !== 'undefined') {
            withClause = `
                WITH CLIENTES_ATIVIDADE AS (
                    SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv1
                ),
                COMPRAS_GERAIS AS (
                    SELECT M.CODPROD
                    FROM PCMOV M
                    JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
                    WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                    GROUP BY M.CODPROD
                )
            `;
            joinClause = `JOIN COMPRAS_GERAIS CG ON CG.CODPROD = P.CODPROD`;
            binds.codatv1 = codatv1;
        }

        const sql = `
            ${withClause}
            SELECT 
                P.CODPROD, 
                P.DESCRICAO, 
                P.CODEPTO, 
                NVL(D.DESCRICAO, 'OUTROS') AS DEPARTAMENTO, 
                NVL(PR.PVENDA, 0) AS PVENDA, 
                PE.CODAUXILIAR AS EAN, 
                PE.QTUNIT, 
                PE.UNMEDIDA AS UNIDADE_EMB
            FROM PCPRODUT P
            JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '1'
            LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
            LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
            ${joinClause}
            OUTER APPLY (
                SELECT CODAUXILIAR, QTUNIT, UNMEDIDA
                FROM PCEMBALAGEM PE2
                WHERE PE2.CODPROD = P.CODPROD
                AND NVL(PE2.ENVIAFV, 'N') = 'S' 
                AND PE2.DTINATIVO IS NULL
                ORDER BY PE2.QTUNIT DESC
                FETCH FIRST 1 ROWS ONLY
            ) PE
            WHERE NVL(P.OBS2, 'X') NOT IN ('FL')
            AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
            ORDER BY NVL(D.DESCRICAO, 'OUTROS'), P.DESCRICAO
        `;

        const result = await conn.execute(sql, binds);

        const produtos = result.rows.map(row => ({
            codprod: row[0],
            descricao: row[1],
            codepto: row[2],
            departamento: row[3],
            preco: row[4],
            ean: row[5] || '',
            qtunit: row[6] || 1,
            unidade: row[7] || 'UN'
        }));

        res.json({ success: true, produtos });
    } catch (err) {
        console.error('[CATALOGO] Erro ao buscar produtos do catálogo:', err);
        res.status(500).json({ success: false, error: 'Erro ao buscar produtos' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch(e) {}
        }
    }
});

module.exports = router;
