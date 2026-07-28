const express = require('express');
const { Pool } = require('pg');
const router = express.Router();

const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'db',
    database: process.env.DB_NAME || 'canal_db',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || 'postgres',
    port: process.env.DB_PORT || 5432,
});

// Registrar clique em Cross-Sell
router.post('/metricas/cross-sell', async (req, res) => {
    const { codusur, codprod } = req.body;

    if (!codusur || !codprod) {
        return res.status(400).json({ success: false, message: 'codusur e codprod são obrigatórios' });
    }

    try {
        const query = 'INSERT INTO metricas_cross_sell (codusur, codprod) VALUES ($1, $2)';
        await pool.query(query, [codusur, codprod]);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao registrar metrica cross-sell:', error);
        res.status(500).json({ success: false });
    }
});

// Ranking de Adesão (Quantas vezes a equipe do gestor X adicionou itens)
router.get('/metricas/cross-sell/ranking', async (req, res) => {
    // Para simplificar, retorna um count por vendedor do dia atual
    try {
        const query = `
            SELECT codusur, count(*) as count 
            FROM metricas_cross_sell 
            WHERE DATE(data_hora) = CURRENT_DATE
            GROUP BY codusur
        `;
        const result = await pool.query(query);
        res.json({ success: true, ranking: result.rows });
    } catch (error) {
        console.error('Erro ao buscar ranking cross-sell:', error);
        res.status(500).json({ success: false });
    }
});

module.exports = router;
