const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const axios = require('axios');
router.get('/', async (req, res) => {
    const { rca, situacao } = req.query;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT A.CODCLI, C.FANTASIA, C.CLIENTE, A.CGCENT, A.SITUACAO_CADASTRAL, TO_CHAR(A.DATA_ANALISE, 'DD/MM/YYYY HH24:MI:SS'), C.CODUSUR1, U.NOME AS NOME_VENDEDOR
            FROM CANAL_ANALISE_CNPJ A
            JOIN PCCLIENT C ON C.CODCLI = A.CODCLI
            LEFT JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
            WHERE 1=1
        `;
        const binds = {};
        
        if (rca && rca.trim() !== '') {
            sql += ` AND C.CODUSUR1 = :rca `;
            binds.rca = rca;
        }

        if (situacao && situacao.trim() !== '' && situacao !== 'TODAS') {
            sql += ` AND A.SITUACAO_CADASTRAL = :situacao `;
            binds.situacao = situacao;
        }

        sql += `
            ORDER BY A.DATA_ANALISE DESC
            FETCH FIRST 100 ROWS ONLY
        `;

        const result = await connection.execute(sql, binds);
        const analises = result.rows.map(r => ({
            codcli: r[0],
            fantasia: r[1],
            cliente: r[2],
            cnpj: r[3],
            situacao: r[4],
            data: r[5],
            codusur: r[6],
            nomeVendedor: r[7] || 'Sem Vendedor'
        }));

        res.json({ success: true, analises });
    } catch (error) {
        console.error('Erro ao buscar analises CNPJ:', error);
        res.status(500).json({ success: false, error: 'Erro ao buscar analises' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.get('/status', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const resultTotal = await connection.execute(`SELECT COUNT(*) FROM PCCLIENT WHERE CGCENT IS NOT NULL AND LENGTH(REGEXP_REPLACE(CGCENT, '[^0-9]', '')) = 14 AND DTEXCLUSAO IS NULL`);
        const resultAnalisados = await connection.execute(`SELECT COUNT(*) FROM CANAL_ANALISE_CNPJ`);

        res.json({ 
            success: true, 
            total: resultTotal.rows[0][0],
            analisados: resultAnalisados.rows[0][0]
        });
    } catch (error) {
        console.error('Erro ao buscar status CNPJ:', error);
        res.status(500).json({ success: false });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});


// POST /api/analise-cnpj/alterar-vendedor
router.post('/alterar-vendedor', async (req, res) => {
    const { codcli, novoCodusur, usuarioLogado } = req.body;

    if (!codcli || !novoCodusur) {
        return res.status(400).json({ success: false, message: 'codcli e novoCodusur são obrigatórios.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Pega vendedor atual
        const resultCli = await connection.execute(
            `SELECT CODUSUR1 FROM PCCLIENT WHERE CODCLI = :codcli`,
            [codcli]
        );
        const vendedorAnterior = resultCli.rows.length > 0 ? resultCli.rows[0][0] : null;

        // Atualiza PCCLIENT
        await connection.execute(
            `UPDATE PCCLIENT SET CODUSUR1 = :novoCodusur WHERE CODCLI = :codcli`,
            [novoCodusur, codcli],
            { autoCommit: false }
        );

        // Insere Log
        await connection.execute(
            `INSERT INTO CANAL_LOG_ALTERACAO_VENDEDOR (CODCLI, VENDEDOR_ANTERIOR, VENDEDOR_NOVO, ALTERADO_POR)
             VALUES (:codcli, :vendedorAnterior, :novoCodusur, :usuarioLogado)`,
            {
                codcli: codcli,
                vendedorAnterior: vendedorAnterior,
                novoCodusur: novoCodusur,
                usuarioLogado: usuarioLogado || 'DESCONHECIDO'
            },
            { autoCommit: true }
        );

        res.json({ success: true, message: 'Vendedor atualizado com sucesso!' });
    } catch (error) {
        console.error('Erro ao alterar vendedor:', error);
        res.status(500).json({ success: false, error: 'Erro ao alterar vendedor' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error(err);
            }
        }
    }
});

// POST /api/analise-cnpj/reconsultar
router.post('/reconsultar', async (req, res) => {
    const { codcli, cnpj } = req.body;
    if (!codcli || !cnpj) {
        return res.status(400).json({ success: false, message: 'codcli e cnpj são obrigatórios.' });
    }

    let connection;
    try {
        const apenasNumeros = cnpj.replace(/\D/g, '');
        
        let novaSituacao = 'NAO_ENCONTRADO';
        try {
            const apiRes = await axios.get(`https://brasilapi.com.br/api/cnpj/v1/${apenasNumeros}`, { timeout: 10000 });
            if (apiRes.data && apiRes.data.descricao_situacao_cadastral) {
                novaSituacao = apiRes.data.descricao_situacao_cadastral;
            }
        } catch (apiErr) {
            if (apiErr.response && apiErr.response.status === 404) {
                novaSituacao = 'CNPJ INVALIDO/NAO ENCONTRADO';
            } else {
                return res.status(500).json({ success: false, message: 'Erro na Brasil API. Tente novamente.' });
            }
        }

        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        await connection.execute(
            `UPDATE CANAL_ANALISE_CNPJ 
             SET SITUACAO_CADASTRAL = :novaSituacao, DATA_ANALISE = CURRENT_TIMESTAMP 
             WHERE CODCLI = :codcli`,
            { novaSituacao, codcli },
            { autoCommit: true }
        );

        res.json({ success: true, novaSituacao, message: 'Consulta atualizada com sucesso!' });
    } catch (error) {
        console.error('Erro ao reconsultar CNPJ:', error);
        res.status(500).json({ success: false, error: 'Erro ao reconsultar CNPJ' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;
