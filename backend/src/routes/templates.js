const express = require('express');
const oracledb = require('oracledb');
const router = express.Router();

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_21_12' });
} catch (err) {
    // Pode já estar inicializado
}

router.get('/', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const query = `SELECT ID, TITULO, TEXTO FROM CANAL_TEMPLATES ORDER BY TITULO ASC`;
        const result = await connection.execute(query);

        const templates = result.rows.map(row => ({
            id: row[0],
            titulo: row[1],
            texto: row[2]
        }));

        return res.json({ success: true, templates });
    } catch (error) {
        if (error.errorNum === 942) {
             return res.json({ success: true, templates: [] }); // table not exist
        }
        console.error('Erro ao buscar templates:', error);
        return res.status(500).json({ success: false, message: 'Erro interno ao buscar templates.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (err) {}
        }
    }
});

module.exports = router;
