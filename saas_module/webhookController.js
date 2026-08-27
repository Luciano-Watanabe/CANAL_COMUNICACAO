const db = require('../database/oracle'); // Adaptar ao caminho do DB real do projeto

/**
 * Controller que recebe o webhook nativo da Evolution API via Tailscale Funnel.
 * Caminho esperado: /api/webhook/whats/:instancia
 */
exports.handleEvolutionWebhook = async (req, res) => {
    try {
        const payload = req.body;
        const instanciaOrigem = req.params.instancia || 'desconhecida';
        
        // 1. Libera a requisição HTTP IMEDIATAMENTE para a Evolution API não dar timeout
        res.status(200).json({ success: true, received: true });

        // 2. Processamento assíncrono super-rápido no banco (Tabela CANAL_WEBHOOK)
        // Convertendo o payload para string (CLOB)
        const conteudoJSON = JSON.stringify(payload);

        const sql = `INSERT INTO CANAL_WEBHOOK (CONTEUDO, ORIGEM) VALUES (:conteudo, :origem)`;
        const binds = {
            conteudo: conteudoJSON,
            origem: instanciaOrigem
        };

        // Assumindo que a função execute existe no wrapper do oracle
        await db.execute(sql, binds, { autoCommit: true });
        
        // Console comentado para não flodar produção
        // console.log(`[WEBHOOK] Mensagem salva na CANAL_WEBHOOK. Origem: ${instanciaOrigem}`);

    } catch (error) {
        // Como o res.status(200) já foi enviado, o client não recebe 500, mas nós logamos
        console.error('[WEBHOOK ERROR] Falha ao inserir payload no Oracle:', error);
    }
};
