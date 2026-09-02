// Buscar infos do cliente por CODCLI
router.get('/clientes/:codcli', async (req, res) => {
    let conn;
    try {
        const { codcli } = req.params;
        conn = await oraclePool.getConnection();
        const result = await conn.execute(\
            SELECT 
                C.CLIENTE,
                C.FANTASIA,
                C.TELCELENT,
                C.TELENT,
                C.TELEFONEENT,
                C.TELCOB,
                C.TELCOM,
                (SELECT NVL(TELEFONE, CELULAR) 
                 FROM PCCONTATO 
                 WHERE CODCLI = C.CODCLI 
                   AND (TELEFONE IS NOT NULL OR CELULAR IS NOT NULL) 
                   AND ROWNUM = 1) AS CONTATO_PCCONTATO
            FROM PCCLIENT C
            WHERE C.CODCLI = :codcli
        \, { codcli });

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }

        const nome = result.rows[0][1] || result.rows[0][0]; // Fantasia ou Cliente
        let telefone = result.rows[0][7] || result.rows[0][2] || result.rows[0][3] || result.rows[0][4] || result.rows[0][5] || result.rows[0][6] || '';
        if (telefone) {
            telefone = String(telefone).replace(/[^0-9]/g, '');
        }

        res.json({ nome, telefone });
    } catch (error) {
        console.error('[SAC] Erro ao buscar cliente:', error);
        res.status(500).json({ error: 'Erro interno' });
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) {}
        }
    }
});
