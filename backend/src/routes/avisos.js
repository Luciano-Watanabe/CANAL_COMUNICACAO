const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// Buscar os últimos 20 avisos
router.get('/avisos', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Traz os avisos junto com o nome de quem mandou e cargo calculados
        const sql = `
            SELECT 
                A.ID, 
                A.TEXTO, 
                A.CODUSUR_REMETENTE, 
                A.DATA_HORA, 
                U.NOME,
                CASE 
                    WHEN G.COD_CADRCA IS NOT NULL THEN 'GERENTE'
                    WHEN S.COD_CADRCA IS NOT NULL THEN 'SUPERVISOR'
                    ELSE 'VENDEDOR'
                END AS CARGO
            FROM CANAL_AVISOS A
            LEFT JOIN PCUSUARI U ON U.CODUSUR = A.CODUSUR_REMETENTE
            LEFT JOIN PCSUPERV S ON U.CODUSUR = S.COD_CADRCA
            LEFT JOIN PCGERENTE G ON U.CODUSUR = G.COD_CADRCA
            ORDER BY A.DATA_HORA DESC
            FETCH FIRST 20 ROWS ONLY
        `;
        
        const result = await connection.execute(sql);

        const avisos = result.rows.map(row => ({
            id: row[0],
            texto: row[1],
            remetente: row[2],
            data_hora: row[3],
            nome_remetente: row[4] || 'Supervisor',
            cargo_remetente: row[5] || 'LIDERANÇA'
        }));

        res.json({ success: true, avisos });
    } catch (err) {
        console.error('Erro ao buscar avisos:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Criar um novo aviso
router.post('/avisos', async (req, res) => {
    const { texto, codusur_remetente, nome_remetente, cargo_remetente } = req.body;

    if (!texto || !codusur_remetente) {
        return res.status(400).json({ success: false, error: 'Texto e remetente são obrigatórios' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `
            INSERT INTO CANAL_AVISOS (TEXTO, CODUSUR_REMETENTE) 
            VALUES (:texto, :remetente)
            RETURNING ID, DATA_HORA INTO :id, :data_hora
        `;
        
        const result = await connection.execute(sql, { 
            texto, 
            remetente: codusur_remetente,
            id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT },
            data_hora: { type: oracledb.DATE, dir: oracledb.BIND_OUT }
        }, { autoCommit: true });

        const novoAviso = {
            id: result.outBinds.id[0],
            texto,
            remetente: codusur_remetente,
            nome_remetente: nome_remetente || 'Supervisor',
            cargo_remetente: cargo_remetente || 'LIDERANÇA',
            data_hora: result.outBinds.data_hora[0]
        };

        // Dispara o aviso para todos os clientes logados em tempo real
        if (global.io) {
            global.io.emit('novo_aviso', novoAviso);
        }

        res.json({ success: true, aviso: novoAviso });
    } catch (err) {
        console.error('Erro ao criar aviso:', err);
        res.status(500).json({ success: false, error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;
