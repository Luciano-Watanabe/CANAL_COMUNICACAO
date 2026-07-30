const express = require('express');
const oracledb = require('oracledb');
const router = express.Router();

// Função helper para pegar conexão
async function getConnection() {
    return await oracledb.getConnection({
        user: process.env.ORACLE_USER,
        password: process.env.ORACLE_PASS,
        connectString: process.env.ORACLE_CONN_STR
    });
}

// GET /api/templates_paginas/:pagina
router.get('/:pagina', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        const pagina = req.params.pagina.toUpperCase();
        
        const query = `SELECT ID, PAGINA, TIPO, TEMPLATE FROM CANAL_MENSAGENS_TEMPLATES WHERE PAGINA = :1 ORDER BY ID ASC`;
        const result = await connection.execute(query, [pagina]);

        const templates = result.rows.map(row => ({
            id: row[0],
            pagina: row[1],
            tipo: row[2],
            template: row[3]
        }));

        return res.json({ success: true, templates });
    } catch (error) {
        console.error('Erro ao buscar templates da página:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar templates.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// GET /api/templates_paginas (Todos)
router.get('/', async (req, res) => {
    let connection;
    try {
        connection = await getConnection();
        
        const query = `SELECT ID, PAGINA, TIPO, TEMPLATE FROM CANAL_MENSAGENS_TEMPLATES ORDER BY PAGINA ASC, ID ASC`;
        const result = await connection.execute(query);

        const templates = result.rows.map(row => ({
            id: row[0],
            pagina: row[1],
            tipo: row[2],
            template: row[3]
        }));

        return res.json({ success: true, templates });
    } catch (error) {
        console.error('Erro ao buscar todos os templates:', error);
        return res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// POST /api/templates_paginas
router.post('/', async (req, res) => {
    let connection;
    try {
        const { pagina, tipo, template } = req.body;
        if (!pagina || !tipo || !template) {
            return res.status(400).json({ success: false, message: 'Página, tipo e template são obrigatórios.' });
        }

        connection = await getConnection();
        
        await connection.execute(
            `INSERT INTO CANAL_MENSAGENS_TEMPLATES (PAGINA, TIPO, TEMPLATE) VALUES (:1, :2, :3)`,
            [pagina.toUpperCase(), tipo, template],
            { autoCommit: true }
        );

        return res.json({ success: true, message: 'Template adicionado com sucesso.' });
    } catch (error) {
        console.error('Erro ao adicionar template:', error);
        return res.status(500).json({ success: false, message: 'Erro ao adicionar template.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// PUT /api/templates_paginas/:id
router.put('/:id', async (req, res) => {
    let connection;
    try {
        const id = req.params.id;
        const { tipo, template } = req.body;
        
        if (!tipo || !template) {
            return res.status(400).json({ success: false, message: 'Tipo e template são obrigatórios.' });
        }

        connection = await getConnection();
        
        await connection.execute(
            `UPDATE CANAL_MENSAGENS_TEMPLATES SET TIPO = :1, TEMPLATE = :2 WHERE ID = :3`,
            [tipo, template, id],
            { autoCommit: true }
        );

        return res.json({ success: true, message: 'Template atualizado com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar template:', error);
        return res.status(500).json({ success: false, message: 'Erro ao atualizar template.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

// DELETE /api/templates_paginas/:id
router.delete('/:id', async (req, res) => {
    let connection;
    try {
        const id = req.params.id;
        connection = await getConnection();
        
        await connection.execute(
            `DELETE FROM CANAL_MENSAGENS_TEMPLATES WHERE ID = :1`,
            [id],
            { autoCommit: true }
        );

        return res.json({ success: true, message: 'Template excluído com sucesso.' });
    } catch (error) {
        console.error('Erro ao excluir template:', error);
        return res.status(500).json({ success: false, message: 'Erro ao excluir template.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;
