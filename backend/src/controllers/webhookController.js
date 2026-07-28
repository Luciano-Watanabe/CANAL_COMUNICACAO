// Controlador para processar webhooks recebidos da Evolution API (WhatsApp)
const io = require('../server').io;

exports.handleEvolutionWebhook = (req, res) => {
    try {
        const payload = req.body;
        
        console.log('[WEBHOOK] Recebido evento da Evolution API:', payload.event || payload.action);
        
        // Aqui identificamos o tipo de evento
        // Na Evolution API, as mensagens costumam vir no event "messages.upsert"
        if (payload.event === 'messages.upsert' || payload.event === 'messages.update') {
            const messageData = payload.data;
            
            // TODO: Salvar mensagem temporariamente no Banco (Fase 2)
            
            // 2. Emitir o evento via Socket.io para o Frontend
            if (global.io) {
                // Na Fase 4, vamos direcionar para a sala correta do vendedor
                global.io.emit('receive-message', {
                    chatId: messageData.key.remoteJid,
                    text: messageData.message?.conversation || messageData.message?.extendedTextMessage?.text,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Retorna 200 OK para a Evolution API não tentar reenviar
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[WEBHOOK ERROR]', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
