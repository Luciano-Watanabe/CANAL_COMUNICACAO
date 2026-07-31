const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');

const cacheService = require('../services/cacheService');

// GET /api/vendedores - Listar todos os vendedores
router.get('/', async (req, res) => {
    const isCacheLoading = !cacheService.isLoaded;

    const { codusur, role } = req.query;

    try {
        let todosVendedores = cacheService.getVendedores();
        const roleUpper = (role || '').toUpperCase();
        let filteredVendedores = [];

        if (roleUpper === 'BOT_GESTOR') {
            // Pode ver todos
            filteredVendedores = todosVendedores;
        } else if (roleUpper === 'GERENTE') {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            filteredVendedores = todosVendedores.filter(v => {
                const hier = cacheService.getHierarchy(v.CODUSUR);
                return hier.gerente === codusur;
            });
        } else if (roleUpper === 'SUPERVISOR') {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            filteredVendedores = todosVendedores.filter(v => {
                const hier = cacheService.getHierarchy(v.CODUSUR);
                return hier.supervisor === codusur;
            });
        } else {
            if (!codusur) return res.status(400).json({ success: false, message: 'codusur obrigatório' });
            filteredVendedores = todosVendedores.filter(v => v.CODUSUR === codusur);
        }

        filteredVendedores.sort((a, b) => (a.NOME || '').localeCompare(b.NOME || ''));
        
        res.json({ success: true, vendedores: filteredVendedores, isCacheLoading });
    } catch (err) {
        console.error('Erro ao buscar vendedores:', err);
        res.status(500).json({ success: false, message: 'Erro ao buscar vendedores' });
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

        // Atualiza a memória cache para evitar dessincronização
        cacheService.updateVendedorCache(codusur, telefone);

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
