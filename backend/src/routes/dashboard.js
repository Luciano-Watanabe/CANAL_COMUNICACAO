const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

router.get('/dashboard/hierarquia', async (req, res) => {
    const { codusur, role } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur é obrigatório' });
    }

    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let data = {};

        if (roleUpper === 'GERENTE') {
            const sqlSuperv = `SELECT COUNT(DISTINCT S.CODSUPERVISOR) FROM PCSUPERV S WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)`;
            const resSuperv = await connection.execute(sqlSuperv, { cod: codusur });
            data.supervisores = resSuperv.rows[0][0] || 0;

            const sqlVend = `
                SELECT COUNT(DISTINCT U.CODUSUR) 
                FROM PCUSUARI U 
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR 
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
            `;
            const resVend = await connection.execute(sqlVend, { cod: codusur });
            data.vendedores = resVend.rows[0][0] || 0;

            const sqlCli = `
                SELECT COUNT(DISTINCT C.CODCLI)
                FROM PCCLIENT C
                JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
            `;
            const resCli = await connection.execute(sqlCli, { cod: codusur });
            data.clientes = resCli.rows[0][0] || 0;

            const sqlConv = `
                SELECT COUNT(DISTINCT M.TELEFONE_CLIENTE)
                FROM CANAL_MENSAGENS M
                JOIN PCUSUARI U ON M.CODUSUR = U.CODUSUR
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
                AND TRUNC(M.DATA_HORA) = TRUNC(SYSDATE)
            `;
            const resConv = await connection.execute(sqlConv, { cod: codusur });
            data.conversas = resConv.rows[0][0] || 0;

        } else if (roleUpper === 'SUPERVISOR') {
            const sqlVend = `
                SELECT COUNT(DISTINCT U.CODUSUR) 
                FROM PCUSUARI U 
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR 
                WHERE S.COD_CADRCA = :cod
            `;
            const resVend = await connection.execute(sqlVend, { cod: codusur });
            data.vendedores = resVend.rows[0][0] || 0;

            const sqlCli = `
                SELECT COUNT(DISTINCT C.CODCLI)
                FROM PCCLIENT C
                JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.COD_CADRCA = :cod
            `;
            const resCli = await connection.execute(sqlCli, { cod: codusur });
            data.clientes = resCli.rows[0][0] || 0;

            const sqlConv = `
                SELECT COUNT(DISTINCT M.TELEFONE_CLIENTE)
                FROM CANAL_MENSAGENS M
                JOIN PCUSUARI U ON M.CODUSUR = U.CODUSUR
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.COD_CADRCA = :cod
                AND TRUNC(M.DATA_HORA) = TRUNC(SYSDATE)
            `;
            const resConv = await connection.execute(sqlConv, { cod: codusur });
            data.conversas = resConv.rows[0][0] || 0;

        } else {
            const sqlCli = `SELECT COUNT(*) FROM PCCLIENT WHERE CODUSUR1 = :cod`;
            const resCli = await connection.execute(sqlCli, { cod: codusur });
            data.clientes = resCli.rows[0][0] || 0;

            const sqlConv = `
                SELECT COUNT(DISTINCT TELEFONE_CLIENTE) 
                FROM CANAL_MENSAGENS 
                WHERE CODUSUR = :cod 
                AND TRUNC(DATA_HORA) = TRUNC(SYSDATE)
            `;
            const resConv = await connection.execute(sqlConv, { cod: codusur });
            data.conversas = resConv.rows[0][0] || 0;
        }

        res.json({ success: true, data, role: roleUpper });

    } catch (err) {
        console.error('Erro ao buscar estatisticas do dashboard:', err);
        res.status(500).json({ success: false, error: 'Erro interno no banco de dados.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/dashboard/ranking', async (req, res) => {
    const { codusur, role, periodo, supervisor } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur é obrigatório' });
    }

    const roleUpper = (role || 'VENDEDOR').toUpperCase();

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const dateFilterMensagens = periodo === 'mes' ? "TRUNC(DATA_HORA, 'MM') = TRUNC(SYSDATE, 'MM')" : "TRUNC(DATA_HORA) = TRUNC(SYSDATE)";
        const dateFilterPcpedc = periodo === 'mes' ? "TRUNC(DATA, 'MM') = TRUNC(SYSDATE, 'MM')" : "TRUNC(DATA) = TRUNC(SYSDATE)";

        let sql = '';
        let binds = { cod: codusur };

        if (roleUpper === 'GERENTE') {
            let supFilter = '';
            if (supervisor) {
                supFilter = ' AND S.CODSUPERVISOR = :sup ';
                binds.sup = supervisor;
            }
            sql = `
                SELECT 
                    U.CODUSUR, 
                    MAX(U.NOME) AS NOME, 
                    (SELECT COUNT(DISTINCT TELEFONE_CLIENTE) FROM CANAL_MENSAGENS WHERE CODUSUR = U.CODUSUR AND ${dateFilterMensagens}) AS ATENDIMENTOS,
                    (SELECT COUNT(DISTINCT NUMPED) FROM PCPEDC WHERE CODUSUR = U.CODUSUR AND ${dateFilterPcpedc}) AS PEDIDOS,
                    (SELECT NVL(SUM(VLTOTAL), 0) FROM PCPEDC WHERE CODUSUR = U.CODUSUR AND ${dateFilterPcpedc}) AS VLTOTAL,
                    MAX(S.CODSUPERVISOR) AS CODSUPERVISOR,
                    MAX(S.NOME) AS NOME_SUPERVISOR
                FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
                ${supFilter}
                GROUP BY U.CODUSUR
            `;
        } else if (roleUpper === 'SUPERVISOR') {
            sql = `
                SELECT 
                    U.CODUSUR, 
                    MAX(U.NOME) AS NOME, 
                    (SELECT COUNT(DISTINCT TELEFONE_CLIENTE) FROM CANAL_MENSAGENS WHERE CODUSUR = U.CODUSUR AND ${dateFilterMensagens}) AS ATENDIMENTOS,
                    (SELECT COUNT(DISTINCT NUMPED) FROM PCPEDC WHERE CODUSUR = U.CODUSUR AND ${dateFilterPcpedc}) AS PEDIDOS,
                    (SELECT NVL(SUM(VLTOTAL), 0) FROM PCPEDC WHERE CODUSUR = U.CODUSUR AND ${dateFilterPcpedc}) AS VLTOTAL
                FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.COD_CADRCA = :cod
                GROUP BY U.CODUSUR
            `;
        } else if (roleUpper === 'VENDEDOR') {
            // Para vendedor, agrupa por cliente
            sql = `
                SELECT 
                    C.CODCLI AS CODUSUR, 
                    MAX(CLI.CLIENTE) AS NOME, 
                    (SELECT COUNT(DISTINCT TELEFONE_CLIENTE) FROM CANAL_MENSAGENS M JOIN VW_CANAL_CLIENTES V ON M.TELEFONE_CLIENTE = V.TELEFONE WHERE V.CODCLI = C.CODCLI AND M.CODUSUR = :cod AND ${dateFilterMensagens}) AS ATENDIMENTOS,
                    COUNT(DISTINCT C.NUMPED) AS PEDIDOS,
                    NVL(SUM(C.VLTOTAL), 0) AS VLTOTAL
                FROM PCPEDC C
                JOIN PCCLIENT CLI ON C.CODCLI = CLI.CODCLI
                WHERE C.CODUSUR = :cod AND ${dateFilterPcpedc}
                GROUP BY C.CODCLI
            `;
        }

        if (sql) {
            const result = await connection.execute(sql, binds);
            let ranking = result.rows.map(row => {
                const atendimentos = row[2] || 0;
                const pedidos = row[3] || 0;
                const vltotal = row[4] || 0;
                const divisor = atendimentos > 0 ? atendimentos : (pedidos > 0 ? pedidos : 1);
                const chatMedio = vltotal > 0 ? (vltotal / divisor) : 0;
                return {
                    id: row[0],
                    nome: row[1],
                    atendimentos,
                    pedidos,
                    vltotal,
                    chatMedio,
                    codsupervisor: row[5],
                    nome_supervisor: row[6] || 'Sem Supervisor'
                };
            });
            
            // Ordenar por chatMedio DESC, VLTOTAL DESC e pegar os top 10
            ranking.sort((a, b) => b.chatMedio - a.chatMedio || b.vltotal - a.vltotal);
            ranking = ranking.slice(0, 10);
            
            return res.json({ success: true, ranking });
        } else {
            return res.json({ success: true, ranking: [] });
        }

    } catch (err) {
        console.error('Erro ao buscar ranking:', err);
        res.status(500).json({ success: false, error: 'Erro interno no banco de dados.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/dashboard/arvore', async (req, res) => {
    const { codusur, role } = req.query;
    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    
    if (roleUpper === 'VENDEDOR') {
        return res.json({ success: true, arvore: null }); 
    }
    
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let arvore = null;

        if (roleUpper === 'GERENTE') {
            const sqlGerente = `SELECT NOME FROM PCUSUARI WHERE CODUSUR = :cod`;
            const resGer = await connection.execute(sqlGerente, { cod: codusur });
            const nomeGerente = resGer.rows.length > 0 ? resGer.rows[0][0] : 'Gerente';

            const sqlSuperv = `SELECT S.CODSUPERVISOR, MAX(U.NOME) 
                               FROM PCSUPERV S
                               JOIN PCUSUARI U ON S.COD_CADRCA = U.CODUSUR
                               WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
                               GROUP BY S.CODSUPERVISOR`;
            const resSup = await connection.execute(sqlSuperv, { cod: codusur });
            
            const supervisores = [];
            for (let row of resSup.rows) {
                const codSup = row[0];
                const nomeSup = row[1];

                const sqlVend = `
                    SELECT U.CODUSUR, U.NOME, 
                    (SELECT COUNT(DISTINCT CODCLI) FROM PCCLIENT WHERE CODUSUR1 = U.CODUSUR) AS QTD_CLIENTES,
                    (SELECT COUNT(DISTINCT TELEFONE_CLIENTE) FROM CANAL_MENSAGENS WHERE CODUSUR = U.CODUSUR AND TRUNC(DATA_HORA) = TRUNC(SYSDATE)) AS ATENDIMENTOS
                    FROM PCUSUARI U 
                    WHERE U.CODSUPERVISOR = :codSup
                `;
                const resVend = await connection.execute(sqlVend, { codSup });
                const vendedores = resVend.rows.map(v => ({ id: v[0], nome: v[1], clientes: v[2], atendimentos: v[3], role: 'Vendedor' }));
                
                supervisores.push({ id: codSup, nome: nomeSup, role: 'Supervisor', filhos: vendedores });
            }

            arvore = { id: codusur, nome: nomeGerente, role: 'Gerente', filhos: supervisores };

        } else if (roleUpper === 'SUPERVISOR') {
            const sqlSuperv = `SELECT MAX(U.NOME), S.CODSUPERVISOR 
                               FROM PCSUPERV S
                               JOIN PCUSUARI U ON S.COD_CADRCA = U.CODUSUR
                               WHERE S.COD_CADRCA = :cod
                               GROUP BY S.CODSUPERVISOR`;
            const resSup = await connection.execute(sqlSuperv, { cod: codusur });
            const nomeSup = resSup.rows.length > 0 ? resSup.rows[0][0] : 'Supervisor';
            const codSup = resSup.rows.length > 0 ? resSup.rows[0][1] : null;

            let vendedores = [];
            if (codSup) {
                const sqlVend = `
                    SELECT U.CODUSUR, U.NOME, 
                    (SELECT COUNT(DISTINCT CODCLI) FROM PCCLIENT WHERE CODUSUR1 = U.CODUSUR) AS QTD_CLIENTES,
                    (SELECT COUNT(DISTINCT TELEFONE_CLIENTE) FROM CANAL_MENSAGENS WHERE CODUSUR = U.CODUSUR AND TRUNC(DATA_HORA) = TRUNC(SYSDATE)) AS ATENDIMENTOS
                    FROM PCUSUARI U 
                    WHERE U.CODSUPERVISOR = :codSup
                `;
                const resVend = await connection.execute(sqlVend, { codSup });
                vendedores = resVend.rows.map(v => ({ id: v[0], nome: v[1], clientes: v[2], atendimentos: v[3], role: 'Vendedor' }));
            }

            arvore = { id: codusur, nome: nomeSup, role: 'Supervisor', filhos: vendedores };
        }

        return res.json({ success: true, arvore });

    } catch (err) {
        console.error('Erro arvore:', err);
        res.status(500).json({ success: false });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/dashboard/ranking-produtos', async (req, res) => {
    const { codusur, role, periodo, departamento } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur é obrigatório' });
    }

    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    const dateFilterPcpedc = periodo === 'mes' ? "TRUNC(C.DATA, 'MM') = TRUNC(SYSDATE, 'MM')" : "TRUNC(C.DATA) = TRUNC(SYSDATE)";
    let deptoFilter = departamento ? `AND P.CODEPTO = :depto` : ``;

    let sql = '';
    
    const baseQuery = `
        SELECT 
            I.CODPROD,
            MAX(P.DESCRICAO) AS DESCRICAO,
            SUM(I.QT) AS QTD_VENDIDA,
            SUM(I.QT * I.PVENDA) AS VLTOTAL,
            MAX(P.CODEPTO) AS CODEPTO,
            MAX(D.DESCRICAO) AS DEPTO_DESC
        FROM PCPEDC C
        JOIN PCPEDI I ON C.NUMPED = I.NUMPED
        JOIN PCPRODUT P ON I.CODPROD = P.CODPROD
        LEFT JOIN PCDEPTO D ON P.CODEPTO = D.CODEPTO
        WHERE ${dateFilterPcpedc} ${deptoFilter}
    `;

    if (roleUpper === 'GERENTE') {
        sql = `
            ${baseQuery}
            AND C.CODUSUR IN (
                SELECT U.CODUSUR FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
            )
            GROUP BY I.CODPROD
            ORDER BY QTD_VENDIDA DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    } else if (roleUpper === 'SUPERVISOR') {
        sql = `
            ${baseQuery}
            AND C.CODUSUR IN (
                SELECT U.CODUSUR FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.COD_CADRCA = :cod
            )
            GROUP BY I.CODPROD
            ORDER BY QTD_VENDIDA DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    } else { // VENDEDOR
        sql = `
            ${baseQuery}
            AND C.CODUSUR = :cod
            GROUP BY I.CODPROD
            ORDER BY QTD_VENDIDA DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const binds = { cod: codusur };
        if (departamento) {
            binds.depto = departamento;
        }

        const result = await connection.execute(sql, binds);
        const ranking = result.rows.map(row => ({
            codprod: row[0],
            descricao: row[1],
            qtd_vendida: row[2] || 0,
            vltotal: row[3] || 0,
            codepto: row[4],
            depto_desc: row[5] || 'Sem Departamento'
        }));

        res.json({ success: true, ranking });
    } catch (e) {
        console.error('Erro /dashboard/ranking-produtos:', e);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/departamentos', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `SELECT CODEPTO, DESCRICAO FROM PCDEPTO ORDER BY DESCRICAO`;
        const result = await connection.execute(sql);
        const departamentos = result.rows.map(row => ({
            codepto: row[0],
            descricao: row[1]
        }));
        res.json({ success: true, departamentos });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/dashboard/ranking-clientes', async (req, res) => {
    const { codusur, role, periodo, atividade } = req.query;

    if (!codusur) {
        return res.status(400).json({ success: false, error: 'codusur é obrigatório' });
    }

    const roleUpper = (role || 'VENDEDOR').toUpperCase();
    const dateFilterPcpedc = periodo === 'mes' ? "TRUNC(C.DATA, 'MM') = TRUNC(SYSDATE, 'MM')" : "TRUNC(C.DATA) = TRUNC(SYSDATE)";
    let atvFilter = atividade ? `AND CLI.CODATV1 = :atv` : ``;

    let sql = '';
    
    const baseQuery = `
        SELECT 
            C.CODCLI,
            MAX(CLI.CLIENTE) AS NOME,
            COUNT(DISTINCT C.NUMPED) AS PEDIDOS,
            NVL(SUM(C.VLTOTAL), 0) AS VLTOTAL,
            MAX(CLI.CODATV1) AS CODATIV,
            MAX(A.RAMO) AS RAMO
        FROM PCPEDC C
        JOIN PCCLIENT CLI ON C.CODCLI = CLI.CODCLI
        LEFT JOIN PCATIVI A ON CLI.CODATV1 = A.CODATIV
        WHERE ${dateFilterPcpedc} ${atvFilter}
    `;

    if (roleUpper === 'GERENTE') {
        sql = `
            ${baseQuery}
            AND C.CODUSUR IN (
                SELECT U.CODUSUR FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
            )
            GROUP BY C.CODCLI
            ORDER BY VLTOTAL DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    } else if (roleUpper === 'SUPERVISOR') {
        sql = `
            ${baseQuery}
            AND C.CODUSUR IN (
                SELECT U.CODUSUR FROM PCUSUARI U
                JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR
                WHERE S.COD_CADRCA = :cod
            )
            GROUP BY C.CODCLI
            ORDER BY VLTOTAL DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    } else { // VENDEDOR
        sql = `
            ${baseQuery}
            AND C.CODUSUR = :cod
            GROUP BY C.CODCLI
            ORDER BY VLTOTAL DESC
            FETCH FIRST 10 ROWS ONLY
        `;
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const binds = { cod: codusur };
        if (atividade) {
            binds.atv = atividade;
        }

        const result = await connection.execute(sql, binds);
        const ranking = result.rows.map(row => ({
            codcli: row[0],
            nome: row[1],
            pedidos: row[2] || 0,
            vltotal: row[3] || 0,
            codativ: row[4],
            ramo: row[5] || 'Sem Atividade'
        }));

        res.json({ success: true, ranking });
    } catch (e) {
        console.error('Erro /dashboard/ranking-clientes:', e);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/atividades', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `SELECT CODATIV, RAMO FROM PCATIVI ORDER BY RAMO`;
        const result = await connection.execute(sql);
        const atividades = result.rows.map(row => ({
            codativ: row[0],
            ramo: row[1]
        }));
        res.json({ success: true, atividades });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;
