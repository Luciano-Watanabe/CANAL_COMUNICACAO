const oracledb = require('oracledb');
const express = require('express');
const router = express.Router();
const cacheService = require('../services/cacheService');
const oraclePool = require('../services/oraclePool');
const { determinarCargo, buscarTodosCargos } = require('../utils/cargoHelper');

// Listar todos os vendedores e seus tokens (Para uso do Gerente)
router.get('/vendedores', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        // Query 1: Buscar vendedores, supervisores e gerentes
        const sqlVendedores = `
            SELECT 
                U.CODUSUR,
                U.NOME,
                U.CARGO AS TIPO,
                T.API_TOKEN,
                T.INSTANCE_NAME,
                T.API_URL,
                T.NOME_ATENDENTE,
                NVL(T.CARGO, U.CARGO) AS TOKEN_CARGO
            FROM VW_CANAL_USUARIOS U
            LEFT JOIN CANAL_TOKENS_EVOLUTION T 
                ON U.CODUSUR = T.CODUSUR 
                AND UPPER(TRIM(U.CARGO)) = UPPER(TRIM(T.CARGO))
            ORDER BY U.NOME, U.CARGO
        `;
        
        // Query 2: Buscar atendentes da PCEMPR
        const sqlAtendentes = `
            SELECT 
                TO_CHAR(E.MATRICULA) AS CODUSUR,
                E.NOME,
                'ATENDENTE' AS TIPO,
                T.API_TOKEN,
                T.INSTANCE_NAME,
                T.API_URL,
                T.NOME_ATENDENTE,
                NVL(T.CARGO, 'ATENDENTE') AS TOKEN_CARGO
            FROM PCEMPR E
            LEFT JOIN CANAL_TOKENS_EVOLUTION T 
                ON TO_CHAR(E.MATRICULA) = T.CODUSUR 
                AND T.CARGO = 'ATENDENTE'
            WHERE E.SITUACAO = 'A'
            ORDER BY E.NOME
        `;

        // Executar ambas as queries
        const resultVendedores = await connection.execute(sqlVendedores);
        const resultAtendentes = await connection.execute(sqlAtendentes);

        // Mapear vendedores
        const vendedores = resultVendedores.rows.map(row => ({
            codusur: row[0],
            nome: row[1],
            tipo: row[2],
            cargo: row[2],
            api_token: row[3] || '',
            instance_name: row[4] || '',
            api_url: row[5] || '',
            nome_atendente: row[6] || '',
            token_cargo: row[7] || row[2]
        }));

        // Mapear atendentes
        const atendentes = resultAtendentes.rows.map(row => ({
            codusur: row[0],
            nome: row[1],
            tipo: row[2],
            cargo: row[2],
            api_token: row[3] || '',
            instance_name: row[4] || '',
            api_url: row[5] || '',
            nome_atendente: row[6] || '',
            token_cargo: row[7] || 'ATENDENTE'
        }));

        // Combinar e ordenar por nome
        const todosUsuarios = [...vendedores, ...atendentes].sort((a, b) => 
            a.nome.localeCompare(b.nome)
        );

        res.json({ success: true, vendedores: todosUsuarios });
    } catch (err) {
        console.error('Erro ao buscar lista de vendedores para configuraÃ§Ã£o:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar vendedores.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// Buscar configuraÃ§Ã£o global
router.get('/global', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES`;
        const result = await connection.execute(sql);

        const configs = {};
        result.rows.forEach(row => {
            configs[row[0]] = row[1];
            if (row[0] === 'ESTOQUE_CODFILIAL') process.env.ESTOQUE_CODFILIAL = row[1];
            if (row[0] === 'TABPR_NUMREGIAO') process.env.TABPR_NUMREGIAO = row[1];
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

// Salvar configuraÃ§Ã£o global
router.post('/global', async (req, res) => {
    const { configs } = req.body;

    let connection;
    try {
        connection = await oraclePool.getConnection();

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
            
            if (chave === 'ESTOQUE_CODFILIAL') process.env.ESTOQUE_CODFILIAL = valor;
            if (chave === 'TABPR_NUMREGIAO') process.env.TABPR_NUMREGIAO = valor;

            if (chave === 'PRIVACY_MODE' && global.io) {
                global.io.emit('privacy_mode_changed', { mode: valor === 'S' });
            }
        }

        res.json({ success: true, message: 'ConfiguraÃ§Ãµes globais salvas!' });
    } catch (err) {
        console.error('Erro ao salvar configs globais:', err);
        res.status(500).json({ success: false, message: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// POST /api/config/token - Agora com suporte a CARGO/TIPO incluindo ATENDENTE
router.post('/token', async (req, res) => {
    const { codusur, api_token, instance_name, api_url, nome_atendente, cargo, tipo, is_atendente } = req.body;

    if (!codusur) {
        return res.status(400).json({ success: false, message: 'CÃ³digo do usuÃ¡rio Ã© obrigatÃ³rio.' });
    }

    let connection;
    try {
        connection = await oraclePool.getConnection();

        // Aceita tanto 'cargo' quanto 'tipo' (frontend pode mandar qualquer um)
        let cargoFinal = cargo || tipo;
        
        // Se nÃ£o foi fornecido, determina automaticamente
        if (!cargoFinal) {
            cargoFinal = await determinarCargo(connection, codusur, is_atendente);
        }

        // Normaliza o cargo (uppercase e trim)
        cargoFinal = String(cargoFinal).toUpperCase().trim();

        console.log(`[CONFIG] Salvando token para CODUSUR: ${codusur}, TIPO: ${cargoFinal}`);

        // MERGE statement considerando CODUSUR + CARGO como chave composta
        const sql = `
            MERGE INTO CANAL_TOKENS_EVOLUTION T
            USING (
                SELECT 
                    :codusur AS CODUSUR, 
                    :cargo AS CARGO,
                    :api_token AS API_TOKEN, 
                    :instance_name AS INSTANCE_NAME, 
                    :api_url AS API_URL, 
                    :nome_atendente AS NOME_ATENDENTE 
                FROM DUAL
            ) S
            ON (T.CODUSUR = S.CODUSUR AND T.CARGO = S.CARGO)
            WHEN MATCHED THEN 
                UPDATE SET 
                    T.API_TOKEN = S.API_TOKEN, 
                    T.INSTANCE_NAME = S.INSTANCE_NAME, 
                    T.API_URL = S.API_URL, 
                    T.NOME_ATENDENTE = S.NOME_ATENDENTE, 
                    T.DATA_ATUALIZACAO = SYSDATE
            WHEN NOT MATCHED THEN 
                INSERT (CODUSUR, CARGO, API_TOKEN, INSTANCE_NAME, API_URL, NOME_ATENDENTE) 
                VALUES (S.CODUSUR, S.CARGO, S.API_TOKEN, S.INSTANCE_NAME, S.API_URL, S.NOME_ATENDENTE)
        `;
        
        await connection.execute(sql, {
            codusur, 
            cargo: cargoFinal,
            api_token: api_token || '', 
            instance_name: instance_name || '', 
            api_url: api_url || '',
            nome_atendente: nome_atendente || ''
        }, { autoCommit: true });

        console.log(`[CONFIG] Token salvo com sucesso para ${codusur} - TIPO: ${cargoFinal}`);

        res.json({ 
            success: true, 
            message: 'ConfiguraÃ§Ãµes salvas com sucesso!',
            cargo: cargoFinal,
            tipo: cargoFinal
        });
    } catch (err) {
        console.error('Erro ao salvar token do vendedor:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao salvar configuraÃ§Ãµes.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/config/funcionarios
router.get('/funcionarios', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            SELECT MATRICULA, NOME, NOME_GUERRA 
            FROM PCEMPR 
            WHERE SITUACAO = 'A'
            ORDER BY NOME
        `;
        const result = await connection.execute(sql, [], { outFormat: 4002 /* OBJECT */ });
        res.json(result.rows);
    } catch (err) {
        console.error('Erro ao buscar funcionarios:', err);
        res.status(500).json({ error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/config/acessos-sac - Atualizado para trabalhar com CARGO = 'ATENDENTE'
router.get('/acessos-sac', async (req, res) => {
    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `SELECT MATRICULA, DEPARTAMENTO_ID FROM CANAL_SAC_ACESSOS`;
        const result = await connection.execute(sql, [], { outFormat: 4002 });
        
        // Group by matricula
        const acessos = {};
        result.rows.forEach(row => {
            if (!acessos[row.MATRICULA]) {
                acessos[row.MATRICULA] = [];
            }
            acessos[row.MATRICULA].push(row.DEPARTAMENTO_ID);
        });

        res.json(acessos);
    } catch (err) {
        console.error('Erro ao buscar acessos SAC:', err);
        res.status(500).json({ error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// POST /api/config/acessos-sac - Atualizado para trabalhar com CARGO = 'ATENDENTE'
router.post('/acessos-sac', async (req, res) => {
    const { matricula, departamentos } = req.body;
    if (!matricula) return res.status(400).json({ error: 'MatrÃ­cula obrigatÃ³ria.' });

    let connection;
    try {
        connection = await oraclePool.getConnection();

        // 1. Deletar acessos existentes para a matricula
        await connection.execute(`DELETE FROM CANAL_SAC_ACESSOS WHERE MATRICULA = :m`, [matricula], { autoCommit: false });

        // 2. Inserir novos acessos
        if (Array.isArray(departamentos) && departamentos.length > 0) {
            const sql = `INSERT INTO CANAL_SAC_ACESSOS (MATRICULA, DEPARTAMENTO_ID) VALUES (:m, :d)`;
            for (let deptId of departamentos) {
                await connection.execute(sql, { m: matricula, d: deptId }, { autoCommit: false });
            }
        }

        await connection.commit();
        res.json({ success: true });
    } catch (err) {
        console.error('Erro ao salvar acessos SAC:', err);
        if (connection) {
            try { await connection.rollback(); } catch(e){}
        }
        res.status(500).json({ error: 'Erro interno.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/config/cargo/:codusur - Novo endpoint para verificar cargo de um usuÃ¡rio
router.get('/cargo/:codusur', async (req, res) => {
    const { codusur } = req.params;
    const { is_atendente } = req.query;

    let connection;
    try {
        connection = await oraclePool.getConnection();

        // Buscar todos os cargos possÃ­veis para o usuÃ¡rio
        const cargos = await buscarTodosCargos(connection, codusur);

        res.json({ 
            success: true, 
            codusur,
            cargos,
            cargo_principal: cargos[0] // Retorna o cargo principal (primeiro da lista)
        });
    } catch (err) {
        console.error('Erro ao buscar cargo do usuÃ¡rio:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar cargo.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

// GET /api/config/tokens/:codusur - Buscar todos os tokens de um CODUSUR (todos os cargos)
router.get('/tokens/:codusur', async (req, res) => {
    const { codusur } = req.params;

    let connection;
    try {
        connection = await oraclePool.getConnection();

        const sql = `
            SELECT 
                CODUSUR,
                CARGO,
                INSTANCE_NAME,
                API_TOKEN,
                API_URL,
                STATUS,
                DATA_ATUALIZACAO,
                NOME_ATENDENTE
            FROM CANAL_TOKENS_EVOLUTION
            WHERE CODUSUR = :codusur
            ORDER BY CARGO
        `;
        
        const result = await connection.execute(sql, [codusur]);

        const tokens = result.rows.map(row => ({
            codusur: row[0],
            cargo: row[1],
            tipo: row[1], // Adiciona 'tipo' tambÃ©m para compatibilidade
            instance_name: row[2] || '',
            api_token: row[3] || '',
            api_url: row[4] || '',
            status: row[5] || '',
            data_atualizacao: row[6],
            nome_atendente: row[7] || ''
        }));

        res.json({ success: true, tokens });
    } catch (err) {
        console.error('Erro ao buscar tokens do usuÃ¡rio:', err);
        res.status(500).json({ success: false, message: 'Erro interno ao buscar tokens.' });
    } finally {
        if (connection) {
            try { await connection.close(); } catch (e) {}
        }
    }
});

module.exports = router;

