const express = require('express');
const router = express.Router();
const oraclePool = require('../services/oraclePool');
const botMensagensService = require('../services/botMensagensService');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bot-mensagens
// Retorna todas as mensagens agrupadas, mesclando defaults com personalizações
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        // Busca todas as personalizações salvas no banco
        const conn = await oraclePool.getConnection();
        const result = await conn.execute(
            `SELECT CHAVE, TEMPLATE, ATUALIZADO_EM FROM CANAL_BOT_MENSAGENS`,
            [],
            { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
        );
        await conn.close();

        // Monta mapa das personalizações
        const personalizadas = {};
        for (const row of result.rows) {
            let tpl = row.TEMPLATE;
            if (tpl && typeof tpl.getData === 'function') {
                tpl = await tpl.getData();
            }
            personalizadas[row.CHAVE] = {
                template: tpl,
                atualizado_em: row.ATUALIZADO_EM
            };
        }

        const defaults = botMensagensService.getAllDefaults();

        // Mescla: para cada chave padrão, indica se foi personalizada
        const mensagens = Object.entries(defaults).map(([chave, def]) => ({
            chave,
            descricao: def.descricao,
            grupo: def.grupo,
            bot_tipo: def.bot_tipo,
            template_padrao: def.template,
            template_atual: personalizadas[chave]?.template ?? def.template,
            personalizada: !!personalizadas[chave],
            atualizado_em: personalizadas[chave]?.atualizado_em ?? null
        }));

        // Agrupa por bot_tipo e depois por grupo
        const agrupado = {};
        for (const msg of mensagens) {
            const botKey = msg.bot_tipo;
            if (!agrupado[botKey]) agrupado[botKey] = {};
            if (!agrupado[botKey][msg.grupo]) agrupado[botKey][msg.grupo] = [];
            agrupado[botKey][msg.grupo].push(msg);
        }

        res.json({ success: true, mensagens, agrupado });
    } catch (err) {
        console.error('[bot-mensagens] Erro ao listar:', err);
        res.status(500).json({ success: false, message: 'Erro ao carregar mensagens do bot.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/bot-mensagens/:chave
// Atualiza ou insere uma mensagem personalizada (UPSERT)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:chave', async (req, res) => {
    const { chave } = req.params;
    const { template } = req.body;

    if (!template || !template.trim()) {
        return res.status(400).json({ success: false, message: 'O template não pode estar vazio.' });
    }

    const defaults = botMensagensService.getAllDefaults();
    if (!defaults[chave]) {
        return res.status(404).json({ success: false, message: `Chave "${chave}" não existe.` });
    }

    const def = defaults[chave];

    try {
        const conn = await oraclePool.getConnection();

        await conn.execute(
            `MERGE INTO CANAL_BOT_MENSAGENS T
             USING (SELECT :chave AS CHAVE FROM DUAL) S
             ON (T.CHAVE = S.CHAVE)
             WHEN MATCHED THEN
                 UPDATE SET T.TEMPLATE = :tpl, T.ATUALIZADO_EM = SYSDATE
             WHEN NOT MATCHED THEN
                 INSERT (CHAVE, DESCRICAO, GRUPO, BOT_TIPO, TEMPLATE, ATUALIZADO_EM)
                 VALUES (:chave, :desc, :grupo, :bot_tipo, :tpl, SYSDATE)`,
            {
                chave,
                tpl: template.trim(),
                desc: def.descricao,
                grupo: def.grupo,
                bot_tipo: def.bot_tipo
            },
            { autoCommit: true }
        );
        await conn.close();

        // Força reload do cache
        await botMensagensService.loadCache();

        res.json({ success: true, message: 'Mensagem atualizada com sucesso.' });
    } catch (err) {
        console.error('[bot-mensagens] Erro ao atualizar:', err);
        res.status(500).json({ success: false, message: 'Erro ao salvar mensagem.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/bot-mensagens/:chave/reset
// Remove a personalização, voltando ao padrão do código
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:chave/reset', async (req, res) => {
    const { chave } = req.params;

    const defaults = botMensagensService.getAllDefaults();
    if (!defaults[chave]) {
        return res.status(404).json({ success: false, message: `Chave "${chave}" não existe.` });
    }

    try {
        const conn = await oraclePool.getConnection();
        await conn.execute(
            `DELETE FROM CANAL_BOT_MENSAGENS WHERE CHAVE = :chave`,
            { chave },
            { autoCommit: true }
        );
        await conn.close();

        // Força reload do cache
        await botMensagensService.loadCache();

        res.json({ success: true, message: 'Mensagem restaurada para o padrão.' });
    } catch (err) {
        console.error('[bot-mensagens] Erro ao resetar:', err);
        res.status(500).json({ success: false, message: 'Erro ao restaurar padrão.' });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot-mensagens/reload-cache
// Força o reload do cache (útil após mudanças em massa)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reload-cache', async (req, res) => {
    try {
        await botMensagensService.loadCache();
        res.json({ success: true, message: 'Cache recarregado com sucesso.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erro ao recarregar cache.' });
    }
});

module.exports = router;
