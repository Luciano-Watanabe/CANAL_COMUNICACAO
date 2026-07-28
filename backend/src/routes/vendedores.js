const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

// GET /api/vendedores - Listar todos os vendedores
router.get('/', async (req, res) => {
    const { codusur, role } = req.query;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        let sql = `
            SELECT U.CODUSUR, U.NOME, U.TELEFONE1, U.TELEFONE2, U.BLOQUEIO
            FROM PCUSUARI U
            WHERE (U.BLOQUEIO = 'N' OR U.BLOQUEIO IS NULL)
        `;
        let binds = {};

        const roleUpper = (role || '').toUpperCase();

        if (roleUpper === 'BOT_GESTOR') {
            // Pode ver todos
        } else if (roleUpper === 'GERENTE') {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            sql += ` AND U.CODUSUR IN (
                SELECT U2.CODUSUR 
                FROM PCUSUARI U2
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U2.CODSUPERVISOR
                WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :codusur)
            )`;
            binds.codusur = codusur;
        } else if (roleUpper === 'SUPERVISOR') {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            sql += ` AND U.CODUSUR IN (
                SELECT U2.CODUSUR 
                FROM PCUSUARI U2
                JOIN PCSUPERV S ON S.CODSUPERVISOR = U2.CODSUPERVISOR
                WHERE S.COD_CADRCA = :codusur
            )`;
            binds.codusur = codusur;
        } else {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            sql += ` AND U.CODUSUR = :codusur`;
            binds.codusur = codusur;
        }

        sql += ` ORDER BY U.NOME ASC`;

        const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        res.json({ success: true, vendedores: result.rows });
    } catch (err) {
        console.error('Erro ao buscar vendedores:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar vendedores' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Erro ao fechar conexão:', err);
            }
        }
    }
});

// PUT /api/vendedores/:codusur - Atualizar telefone de um vendedor
router.put('/:codusur', async (req, res) => {
    const { codusur } = req.params;
    const { telefone } = req.body; // Vem apenas os numeros (ex: 5512999999999)

    if (!telefone) {
        return res.status(400).json({ success: false, message: 'Telefone é obrigatório' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Atualiza o TELEFONE1 e limpa o TELEFONE2 (para evitar contatos duplicados errados)
        const sql = `
            UPDATE PCUSUARI 
            SET TELEFONE1 = :telefone, TELEFONE2 = NULL 
            WHERE CODUSUR = :codusur
        `;
        
        const result = await connection.execute(sql, { telefone, codusur }, { autoCommit: true });
        
        if (result.rowsAffected === 0) {
            return res.status(404).json({ success: false, message: 'Vendedor não encontrado' });
        }

        res.json({ success: true, message: 'Telefone atualizado com sucesso' });
    } catch (err) {
        console.error('Erro ao atualizar vendedor:', err);
        res.status(500).json({ success: false, message: 'Erro ao atualizar vendedor' });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (err) {
                console.error('Erro ao fechar conexão:', err);
            }
        }
    }
});

module.exports = router;
