const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// Listar todas as regras
router.get('/', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `SELECT * FROM CANAL_MENSAGENS_AUT_CONFIG ORDER BY ID DESC`;
        const result = await connection.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        res.json({ success: true, automacoes: result.rows });
    } catch (err) {
        console.error('Erro ao listar automacoes:', err);
        res.status(500).json({ success: false, message: 'Erro ao listar automacoes' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Endpoint para Preview dos Clientes Impactados
router.get('/preview', async (req, res) => {
    const { tipo_regra, dias_gatilho, dia_especifico } = req.query;
    
    if (!tipo_regra) {
        return res.status(400).json({ success: false, message: 'O tipo_regra é obrigatório para o preview' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = '';
        let params = {};
        
        if (tipo_regra === 'SEM_VENDA') {
            const dias = parseInt(dias_gatilho) || 0;
            sql = `
                SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
                       (TRUNC(SYSDATE) - TRUNC(C.DTULTCOMP)) AS VALOR_ANALISE
                FROM PCCLIENT C
                JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
                WHERE C.DTULTCOMP IS NOT NULL
                  AND TRUNC(SYSDATE) - TRUNC(C.DTULTCOMP) = :dias
                  AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
                FETCH FIRST 50 ROWS ONLY
            `;
            params = { dias };
        } else if (tipo_regra === 'PERIODO_PROXIMO') {
            const dias = parseInt(dias_gatilho) || 0;
            sql = `
                SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
                       C.PRAZOMEDIO AS VALOR_ANALISE
                FROM PCCLIENT C
                JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
                WHERE C.DTULTCOMP IS NOT NULL
                  AND C.PRAZOMEDIO > 0
                  AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
                  AND TRUNC(C.DTULTCOMP + C.PRAZOMEDIO) - TRUNC(SYSDATE) = :dias
                FETCH FIRST 50 ROWS ONLY
            `;
            params = { dias };
        } else if (tipo_regra === 'VISITA') {
            sql = `
                SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
                       1 AS VALOR_ANALISE
                FROM CANAL_VISITAS V
                JOIN PCCLIENT C ON V.CODCLI = C.CODCLI
                JOIN PCUSUARI U ON V.CODUSUR = U.CODUSUR
                WHERE V.STATUS = 'PENDENTE'
                  AND V.TIPO_MENSAGEM IN ('CHEGADA', 'AMBAS')
                  AND TRUNC(V.DATA_AGENDADA) = TRUNC(SYSDATE + 1)
                  AND NVL(C.TELENT, C.TELCOB) IS NOT NULL
                FETCH FIRST 50 ROWS ONLY
            `;
        } else if (tipo_regra === 'DIA_ESPECIFICO') {
            // Mock preview para dias específicos
            sql = `
                SELECT C.CODCLI, C.CLIENTE, NVL(C.TELENT, C.TELCOB) AS TELEFONE, U.NOME AS NOME_VENDEDOR,
                       0 AS VALOR_ANALISE
                FROM PCCLIENT C
                JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
                WHERE NVL(C.TELENT, C.TELCOB) IS NOT NULL
                FETCH FIRST 10 ROWS ONLY
            `;
        } else {
            return res.json({ success: true, clientes: [] });
        }

        const result = await connection.execute(sql, params, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ success: true, clientes: result.rows });
        
    } catch (err) {
        console.error('Erro no preview:', err);
        res.status(500).json({ success: false, message: 'Erro ao gerar preview' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Criar regra
router.post('/', async (req, res) => {
    const { tipo_regra, dias_gatilho, dia_especifico, template_mensagem, ativo } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            INSERT INTO CANAL_MENSAGENS_AUT_CONFIG (TIPO_REGRA, DIAS_GATILHO, DIA_ESPECIFICO, TEMPLATE_MENSAGEM, ATIVO)
            VALUES (:tipo, :dias, :diaEsp, :template, :ativo)
        `;
        
        await connection.execute(sql, {
            tipo: tipo_regra,
            dias: dias_gatilho || null,
            diaEsp: dia_especifico || null,
            template: template_mensagem,
            ativo: ativo || 'S'
        }, { autoCommit: true });
        
        res.json({ success: true, message: 'Automação criada com sucesso' });
    } catch (err) {
        console.error('Erro ao criar automação:', err);
        res.status(500).json({ success: false, message: 'Erro ao criar automação' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Atualizar regra
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { tipo_regra, dias_gatilho, dia_especifico, template_mensagem, ativo } = req.body;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            UPDATE CANAL_MENSAGENS_AUT_CONFIG 
            SET TIPO_REGRA = :tipo, DIAS_GATILHO = :dias, DIA_ESPECIFICO = :diaEsp, TEMPLATE_MENSAGEM = :template, ATIVO = :ativo, ATUALIZADO_EM = SYSDATE
            WHERE ID = :id
        `;
        
        const result = await connection.execute(sql, {
            tipo: tipo_regra,
            dias: dias_gatilho || null,
            diaEsp: dia_especifico || null,
            template: template_mensagem,
            ativo: ativo || 'S',
            id
        }, { autoCommit: true });
        
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, message: 'Automação não encontrada' });
        }
        
        res.json({ success: true, message: 'Automação atualizada com sucesso' });
    } catch (err) {
        console.error('Erro ao atualizar automação:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar automação' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// Deletar regra
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `DELETE FROM CANAL_MENSAGENS_AUT_CONFIG WHERE ID = :id`;
        const result = await connection.execute(sql, { id }, { autoCommit: true });
        
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, message: 'Automação não encontrada' });
        }
        
        res.json({ success: true, message: 'Automação excluída com sucesso' });
    } catch (err) {
        console.error('Erro ao excluir automação:', err);
        res.status(500).json({ success: false, message: 'Erro ao excluir automação' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;
