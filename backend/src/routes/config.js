const express = require('express');
const oracledb = require('oracledb');
const router = express.Router();
const cacheService = require('../services/cacheService');

try {
    oracledb.initOracleClient({ libDir: '/opt/oracle/instantclient_19_21' });
} catch (err) {}

// Listar todos os vendedores e seus tokens (Para uso do Gerente)
router.get('/vendedores', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // Trazendo usuários que são vendedores e o token, se houver
        const sql = `
            SELECT 
                U.CODUSUR,
                U.NOME,
                U.CARGO,
                T.API_TOKEN,
                T.INSTANCE_NAME,
                T.API_URL,
                T.NOME_ATENDENTE
            FROM VW_CANAL_USUARIOS U
            LEFT JOIN CANAL_TOKENS_EVOLUTION T ON U.CODUSUR = T.CODUSUR
            ORDER BY U.NOME
        `;
        const result = await connection.execute(sql);

        const vendedores = result.rows.map(row => ({
            codusur: row[0],
            nome: row[1],
            cargo: row[2],
            api_token: row[3] || '',
            instance_name: row[4] || '',
            api_url: row[5] || '',
            nome_atendente: row[6] || ''
        }));

        res.json({ success: true, vendedores });
    } catch (err) {
        console.error('Erro ao buscar lista de vendedores para configuração:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar vendedores.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar configuração global
router.get('/global', async (req, res) => {
    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        const sql = `SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES`;
        const result = await connection.execute(sql);

        const configs = {};
        result.rows.forEach(row => {
            configs[row[0]] = row[1];
        });

        // Fallback to process.env if not in database
        if (!configs['GROQ_API_KEY'] && process.env.GROQ_API_KEY) {
            configs['GROQ_API_KEY'] = process.env.GROQ_API_KEY;
        }
        if (!configs['GROK_API_KEY'] && process.env.GROK_API_KEY) {
            configs['GROK_API_KEY'] = process.env.GROK_API_KEY;
        }

        res.json({ success: true, configs });
    } catch (err) {
        console.error('Erro ao buscar configs globais:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Salvar configuração global
router.post('/global', async (req, res) => {
    const { configs } = req.body;

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        for (const [chave, valor] of Object.entries(configs)) {
            const sql = `
                MERGE INTO CANAL_CONFIGURACOES T
                USING (SELECT :chave AS CHAVE, :valor AS VALOR FROM DUAL) S
                ON (T.CHAVE = S.CHAVE)
                WHEN MATCHED THEN 
                    UPDATE SET T.VALOR = S.VALOR
                WHEN NOT MATCHED THEN 
                    INSERT (CHAVE, VALOR) VALUES (S.CHAVE, S.VALOR)
            `;
            await connection.execute(sql, { chave, valor: valor || '' }, { autoCommit: true });
            
            cacheService.updateConfigCache(chave, valor || '');

            if (chave === 'PRIVACY_MODE' && global.io) {
                global.io.emit('privacy_mode_changed', { mode: valor === 'S' });
            }
        }

        res.json({ success: true, message: 'Configurações globais salvas!' });
    } catch (err) {
        console.error('Erro ao salvar configs globais:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

router.post('/token', async (req, res) => {
    const { codusur, api_token, instance_name, api_url, nome_atendente } = req.body;

    if (!codusur) {
        return res.status(400).json({ success: false, message: 'Código do usuário é obrigatório.' });
    }

    let connection;
    try {
        connection = await oracledb.getConnection({
            user: process.env.ORACLE_USER,
            password: process.env.ORACLE_PASS,
            connectString: process.env.ORACLE_CONN_STR
        });

        // MERGE statement is Oracle's standard way to UPSERT
        const sql = `
            MERGE INTO CANAL_TOKENS_EVOLUTION T
            USING (SELECT :codusur AS CODUSUR, :api_token AS API_TOKEN, :instance_name AS INSTANCE_NAME, :api_url AS API_URL, :nome_atendente AS NOME_ATENDENTE FROM DUAL) S
            ON (T.CODUSUR = S.CODUSUR)
            WHEN MATCHED THEN 
                UPDATE SET T.API_TOKEN = S.API_TOKEN, T.INSTANCE_NAME = S.INSTANCE_NAME, T.API_URL = S.API_URL, T.NOME_ATENDENTE = S.NOME_ATENDENTE, T.DATA_ATUALIZACAO = SYSDATE
            WHEN NOT MATCHED THEN 
                INSERT (CODUSUR, API_TOKEN, INSTANCE_NAME, API_URL, NOME_ATENDENTE) 
                VALUES (S.CODUSUR, S.API_TOKEN, S.INSTANCE_NAME, S.API_URL, S.NOME_ATENDENTE)
        `;
        
        await connection.execute(sql, {
            codusur, 
            api_token: api_token || '', 
            instance_name: instance_name || '', 
            api_url: api_url || '',
            nome_atendente: nome_atendente || ''
        }, { autoCommit: true });

        res.json({ success: true, message: 'Configurações salvas com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar token do vendedor:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar configurações.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;
