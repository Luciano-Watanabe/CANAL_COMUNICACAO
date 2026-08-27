const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
const cacheService = require('./cacheService');
const SacBotService = require('./SacBotService');
const VendedorBotService = require('./VendedorBotService');
const oraclePool = require('./oraclePool');


const botReplyCache = new Map();

class WebhookPoller {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        this.pollIntervalMs = 5000; // Poll every 5 seconds
        this.sacBotService = new SacBotService(this);
        this.vendedorBotService = new VendedorBotService(this);
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(() => this.poll(), this.pollIntervalMs);
        console.log('[WebhookPoller] Started polling CANAL_WEBHOOK every 5s');
    }

    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[WebhookPoller] Stopped polling');
        }
    }

    async poll() {
        if (this.isRunning) return;
        this.isRunning = true;

        let conn;
        let newWebhooks;
        let lastId = 0;

        // Fase 1: Buscar Webhooks pendentes
        try {
            conn = await oraclePool.getConnection();

            // Get last processed ID
            const stateResult = await conn.execute(`SELECT LAST_PROCESSED_ID FROM CANAL_WEBHOOK_STATE WHERE ID = 1`);
            if (stateResult.rows.length > 0) {
                lastId = stateResult.rows[0][0];
            }

            // Fetch new webhooks
            newWebhooks = await conn.execute(`
                SELECT ID, DATA_RECEBIMENTO, CONTEUDO 
                FROM CANAL_WEBHOOK 
                WHERE ID > :lastId 
                ORDER BY ID ASC
            `, [lastId]);

        } catch (err) {
            console.error('[WebhookPoller] Database error on fetch:', err);
            this.isRunning = false;
            if (conn) {
                try { await conn.close(); } catch (e) {}
            }
            return; // Sai se deu erro ao buscar
        } finally {
            if (conn) {
                try { await conn.close(); } catch (e) {}
            }
        }

        // Fase 2: Processar em paralelo usando o Pool
        if (newWebhooks && newWebhooks.rows && newWebhooks.rows.length > 0) {
            let maxIdProcessed = lastId;

            // Transforma as linhas em Promises de processamento independente
            const processPromises = newWebhooks.rows.map(async (row) => {
                const id = row[0];
                const dt = row[1];
                const clob = row[2];

                let workerConn;
                try {
                    // Pega conexão própria para rodar as queries do chatbot sem bloquear as outras
                    workerConn = await oraclePool.getConnection();

                    let jsonString = '';
                    if (clob) {
                        if (typeof clob.getData === 'function') {
                            jsonString = await clob.getData();
                        } else {
                            jsonString = clob;
                        }
                    }

                    if (jsonString) {
                        const payload = JSON.parse(jsonString);
                
                        console.log(`[WebhookPoller] Novo webhook processado (ID: ${id}) - Evento: ${payload.event}`);

                        if (payload.event !== 'messages.upsert' && payload.event !== 'MESSAGES_UPSERT' && payload.event !== 'Message') {
                            console.log(`[WebhookPoller] Ignorando evento não-upsert: ${payload.event}`);
                        } else {
                            await this.processPayload(payload, workerConn);
                        }
                    }
                } catch (parseErr) {
                    console.error(`[WebhookPoller] Erro ao processar webhook ID ${id}:`, parseErr);
                } finally {
                    if (workerConn) {
                        try { await workerConn.close(); } catch (e) {}
                    }
                }
            });

            // Aguarda TODOS do lote terminarem de ser processados (sucesso ou erro)
            await Promise.allSettled(processPromises);

            // Obtém o maior ID do lote processado
            const lastRowIndex = newWebhooks.rows.length - 1;
            maxIdProcessed = newWebhooks.rows[lastRowIndex][0];

            // Fase 3: Atualizar o LAST_PROCESSED_ID
            if (maxIdProcessed > lastId) {
                let updateConn;
                try {
                    updateConn = await oraclePool.getConnection();
                    await updateConn.execute(`UPDATE CANAL_WEBHOOK_STATE SET LAST_PROCESSED_ID = :maxId WHERE ID = 1`, [maxIdProcessed], { autoCommit: true });
                } catch (err) {
                    console.error('[WebhookPoller] Erro ao atualizar LAST_PROCESSED_ID:', err);
                } finally {
                    if (updateConn) {
                        try { await updateConn.close(); } catch (e) {}
                    }
                }
            }
        }

        this.isRunning = false;
    }

    async processPayload(payload, conn) {
        const data = payload.data;
        if (!data) return;

        // Se for formato Evolution-Go ("Message" event)
        if (payload.event === 'Message') {
            const info = data.Info;
            if (!info) return;

            // Evitar loop infinito do proprio bot
            if (info.IsFromMe) return;

            const remoteJid = info.Chat || info.Sender; // Ex: 5511999999999@s.whatsapp.net
            const instanceName = payload.instanceName || 'padrao';
            
            let textMessage = '';
            let isAudio = false;
            
            // Busca base64 em vários locais possíveis no payload da GO
            let audioBase64 = data.base64 || payload.base64 || data.Message?.base64 || data.Message?.documentMessage?.base64 || data.Message?.imageMessage?.base64 || data.Message?.videoMessage?.base64 || data.Message?.audioMessage?.base64 || null;
            let originalMessage = data;

            if (data.Message) {
                textMessage = data.Message.conversation || 
                              data.Message.extendedTextMessage?.text ||
                              data.Message.imageMessage?.caption ||
                              data.Message.videoMessage?.caption ||
                              data.Message.documentMessage?.caption;

                if (!textMessage) {
                    if (data.Message.audioMessage) {
                        isAudio = true;
                        textMessage = `[AUDIO]${info.ID}.ogg`;
                        console.log('AUDIO DETECTADO no GO! id=', info.ID);
                    } else if (data.Message.documentMessage) {
                        textMessage = `[DOCUMENTO] ${data.Message.documentMessage.fileName || 'documento.pdf'}`;
                        console.log('DOCUMENTO DETECTADO no GO!');
                    } else if (data.Message.imageMessage) {
                        textMessage = `[IMAGEM] ${info.ID}.jpg`;
                        console.log('IMAGEM DETECTADA no GO!');
                    } else if (data.Message.videoMessage) {
                        textMessage = `[VIDEO] ${info.ID}.mp4`;
                        console.log('VIDEO DETECTADO no GO!');
                    } else {
                        textMessage = '[Mensagem não suportada / Mídia]';
                    }
                }
            }

            if (!remoteJid) return;
            const telefone = remoteJid.split('@')[0]; // Remove o @s.whatsapp.net

            const codusur = await this.findCodusurPorTelefone(telefone, conn);

            // Grava no banco e emite o socket
            const msgObj = {
                id: info.ID,
                chat_id: telefone,
                sender: 'cliente',
                text: textMessage,
                timestamp: info.Timestamp || new Date().toISOString()
            };

            // --- Lógica de Retorno de Visitas ---
            if (msgObj.text && msgObj.text.toLowerCase().startsWith('#retorno')) {
                const handled = await this.processarRetornoVisita(telefone, msgObj.text, conn, require('../server').io, instanceName);
                if (handled) return; // Se processou como retorno, não envia para o chat do cliente
            }

            await this.saveMessage(msgObj, instanceName, conn, originalMessage, audioBase64);

            if (codusur) {
                const roomName = `user_${codusur}`;
                // Como estamos num worker isolado, fazemos um POST interno pro Backend notificar o socket
                try {
                    const axios = require('axios');
                    await axios.post('http://backend:3001/api/internal/emit', {
                        roomName,
                        eventName: 'nova_mensagem',
                        payload: msgObj
                    });
                } catch (err) {
                    console.error('[WebhookPoller] Erro ao notificar backend via HTTP POST:', err.message);
                }
            } else {
                console.log(`[WebhookPoller] Cliente ${telefone} não encontrado na PCCLIENT. Mensagem arquivada.`);
            }
            
            // Verifica se a instância é a do SAC BOT
            let isSacBot = false;
            try {
                // Checa SAC BOT
                const sacBotRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
                if (sacBotRes.rows.length > 0 && sacBotRes.rows[0][0]) {
                    const sacCodusur = sacBotRes.rows[0][0];
                    const instRes = await conn.execute(`SELECT INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
                    if (instRes.rows.length > 0) {
                        const dbInstanceName = instRes.rows[0][0];
                        if (dbInstanceName === instanceName) {
                            isSacBot = true;
                        }
                    }
                }
            } catch (e) {
                console.error("[WebhookPoller] Erro ao checar SAC_BOT_CODUSUR", e);
            }

            if (isSacBot) {
                // Verifica se o telefone pertence a um vendedor
                const codvendedor = await this.findVendedorPorTelefone(telefone, conn);
                if (codvendedor) {
                    // Roteia para o BOT do Vendedor
                    await this.vendedorBotService.handleMessage(telefone, textMessage, instanceName, conn, isAudio, audioBase64, originalMessage, codvendedor);
                    return;
                }

                // Roteia para o BOT do SAC e não envia autoReply padrão
                await this.sacBotService.handleMessage(telefone, textMessage, instanceName, conn, isAudio, audioBase64, originalMessage);
                return;
            }

            await this.handleBotAutoReply(telefone, instanceName, conn);
            
            return;
        }

        // Se for formato NodeJS Evolution API (fallback)
        if (!data.message || !data.key) return;

        const messageData = data.message;
        
        if (data.key.fromMe) return;

        const fallbackRemoteJid = data.key.remoteJid;
        const pushName = data.pushName || 'Cliente';
        const fallbackInstanceName = payload.instance || 'padrao';

        let fallbackTextMessage = '';
        let fallbackIsAudio = false;
        let fallbackAudioBase64 = data.base64 || payload.base64 || (messageData && messageData.base64) || null;
        let fallbackOriginalMessage = data;

        if (messageData.conversation) {
            fallbackTextMessage = messageData.conversation;
        } else if (messageData.extendedTextMessage && messageData.extendedTextMessage.text) {
            fallbackTextMessage = messageData.extendedTextMessage.text;
        } else if (messageData.imageMessage && messageData.imageMessage.caption) {
            fallbackTextMessage = messageData.imageMessage.caption;
        } else if (messageData.videoMessage && messageData.videoMessage.caption) {
            fallbackTextMessage = messageData.videoMessage.caption;
        } else if (messageData.documentMessage && messageData.documentMessage.caption) {
            fallbackTextMessage = messageData.documentMessage.caption;
        } else if (messageData.audioMessage) {
            fallbackIsAudio = true;
            fallbackTextMessage = `[AUDIO]${data.key.id}.ogg`;
            console.log('AUDIO DETECTADO no FALLBACK!');
        } else if (messageData.documentMessage) {
            fallbackTextMessage = `[DOCUMENTO] ${messageData.documentMessage.fileName || 'documento.pdf'}`;
            console.log('DOCUMENTO DETECTADO no FALLBACK!');
        } else if (messageData.imageMessage) {
            fallbackTextMessage = `[IMAGEM] ${data.key.id}.jpg`;
            console.log('IMAGEM DETECTADA no FALLBACK!');
        } else if (messageData.videoMessage) {
            fallbackTextMessage = `[VIDEO] ${data.key.id}.mp4`;
            console.log('VIDEO DETECTADO no FALLBACK!');
        } else {
            fallbackTextMessage = '[Mensagem não suportada / Mídia]';
        }

        if (!fallbackRemoteJid) return;
        const fallbackTelefone = fallbackRemoteJid.split('@')[0];

        const fallbackCodusur = await this.findCodusurPorTelefone(fallbackTelefone, conn);

        const fallbackMsgObj = {
            id: data.key.id,
            chat_id: fallbackTelefone,
            sender: 'cliente',
            text: fallbackTextMessage,
            timestamp: new Date().toISOString()
        };

        // --- Lógica de Retorno de Visitas ---
        if (fallbackMsgObj.text && fallbackMsgObj.text.toLowerCase().startsWith('#retorno')) {
            const handled = await this.processarRetornoVisita(fallbackTelefone, fallbackMsgObj.text, conn, require('../server').io, fallbackInstanceName);
            if (handled) return; // Se processou como retorno, não envia para o chat do cliente
        }

        await this.saveMessage(fallbackMsgObj, fallbackInstanceName, conn, fallbackOriginalMessage, fallbackAudioBase64);

        if (fallbackCodusur) {
            const roomName = `user_${fallbackCodusur}`;
            try {
                const axios = require('axios');
                await axios.post('http://backend:3001/api/internal/emit', {
                    roomName,
                    eventName: 'nova_mensagem',
                    payload: fallbackMsgObj
                });
            } catch (err) {
                console.error('[WebhookPoller] Erro ao notificar backend via HTTP POST:', err.message);
            }
        } else {
            console.log(`[WebhookPoller] Cliente ${fallbackTelefone} não encontrado. Mensagem arquivada.`);
        }
        
        // Verifica se a instância é a do SAC BOT
        let fallbackIsSacBot = false;
        try {
            // Checa SAC BOT
            const sacBotRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'SAC_BOT_CODUSUR'`);
            if (sacBotRes.rows.length > 0 && sacBotRes.rows[0][0]) {
                const sacCodusur = sacBotRes.rows[0][0];
                const instRes = await conn.execute(`SELECT INSTANCE_NAME FROM CANAL_TOKENS_EVOLUTION WHERE CODUSUR = :cod`, { cod: sacCodusur });
                if (instRes.rows.length > 0) {
                    const dbInstanceName = instRes.rows[0][0];
                    if (dbInstanceName === fallbackInstanceName) {
                        fallbackIsSacBot = true;
                    }
                }
            }
        } catch (e) {
            console.error("[WebhookPoller] Erro ao checar SAC_BOT_CODUSUR no fallback", e);
        }

        if (fallbackIsSacBot) {
            const codvendedor = await this.findVendedorPorTelefone(fallbackTelefone, conn);
            if (codvendedor) {
                await this.vendedorBotService.handleMessage(fallbackTelefone, fallbackTextMessage, fallbackInstanceName, conn, fallbackIsAudio, fallbackAudioBase64, data, codvendedor);
                return;
            }
            await this.sacBotService.handleMessage(fallbackTelefone, fallbackTextMessage, fallbackInstanceName, conn, fallbackIsAudio, fallbackAudioBase64, data);
            return;
        }

        await this.handleBotAutoReply(fallbackTelefone, fallbackInstanceName, conn);
    }

    async handleBotAutoReply(telefone, instanceName, conn) {
        if (!instanceName) return;
        const upperInstance = instanceName.toUpperCase();
        
        // Verifica se é a instância de envio (BOT_GESTOR ou contendo BOT)
        if (upperInstance.includes('BOT_GESTOR') || upperInstance.includes('BOT')) {
            const now = Date.now();
            const lastReply = botReplyCache.get(telefone);
            
            // Só responde a cada 4 horas (14400000 ms) para não flodar o cliente se ele mandar várias mensagens
            if (!lastReply || (now - lastReply > 14400000)) {
                botReplyCache.set(telefone, now);
                const botMessage = "🤖 *Mensagem Automática*\n\nOlá! Eu sou o assistente virtual (BOT).\nEste é um canal apenas para envios de catálogos e ofertas.\n\nPara tirar dúvidas ou realizar novos pedidos, por favor, *entre em contato diretamente com o seu vendedor.*";
                await this.enviarMensagemBot(telefone, botMessage, conn, instanceName);
                console.log(`[WebhookPoller] Auto-reply de BOT enviado para ${telefone}`);
            }
        }
    }

    async findCodusurPorTelefone(telefone, conn) {
        // Encontra primeiro o RCA correspondente pela tabela de clientes, ou outro critério
        // Usamos PCCLIENT para buscar o RCA (CODUSUR) que atende esse telefone (campo TELENT ou TELCOB)
        const result = await conn.execute(`
            SELECT C.CODUSUR1
            FROM PCCLIENT C
            LEFT JOIN PCCONTATO CT ON C.CODCLI = CT.CODCLI AND (
                REPLACE(REPLACE(REPLACE(REPLACE(CT.TELEFONE, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(CT.CELULAR, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
            )
            WHERE 
                REPLACE(REPLACE(REPLACE(REPLACE(C.TELCELENT, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(C.TELENT, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(C.TELCOM, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(C.TELCOB, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(CT.TELEFONE, ' ', ''), '-', ''), '(', ''), ')', '') = :tel OR
                REPLACE(REPLACE(REPLACE(REPLACE(CT.CELULAR, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
            FETCH FIRST 1 ROWS ONLY
        `, { tel: telefone });
        
        if (result.rows.length > 0) return result.rows[0][0];

        // Se não encontrar direto, busca pelo CADASTRAR_CONTATOS (supondo que a estrutura da sua view já suporte)
        return null;
    }

    async findVendedorPorTelefone(telefone, conn) {
        const result = await conn.execute(`
            SELECT CODUSUR FROM PCUSUARI
            WHERE TELEFONE1 IS NOT NULL
              AND (REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE1, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
               OR  REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE2, ' ', ''), '-', ''), '(', ''), ')', '') = :tel)
            ORDER BY CODUSUR ASC
            FETCH FIRST 1 ROWS ONLY
        `, { tel: telefone });
        if (result.rows.length > 0) return result.rows[0][0];
        return null;
    }

    async processarRetornoVisita(telefone, texto, conn, io, instanceName) {
        const codvendedor = await this.findVendedorPorTelefone(telefone, conn);
        if (!codvendedor) {
            console.log(`[WebhookPoller] Telefone ${telefone} enviou #retorno, mas não foi identificado como vendedor.`);
            return false;
        }

        const feedbackText = texto.substring(8).trim(); // Remove "#retorno"

        // Encontra a visita mais recente sinalizada e pendente/realizada sem retorno hoje
        const sqlVisita = `
            SELECT ID FROM CANAL_VISITAS
            WHERE CODUSUR = :cod
              AND SINALIZADO_VENDEDOR = 'S'
              AND (STATUS = 'PENDENTE' OR (STATUS = 'REALIZADA' AND RETORNO IS NULL))
              AND TRUNC(DATA_AGENDADA) = TRUNC(SYSDATE)
            ORDER BY DATA_AGENDADA DESC
            FETCH FIRST 1 ROWS ONLY
        `;
        const resVisita = await conn.execute(sqlVisita, { cod: codvendedor });

        if (resVisita.rows.length === 0) {
            await this.enviarMensagemBot(telefone, "Não encontrei nenhuma visita pendente sinalizada para você hoje.", conn, instanceName);
            return true;
        }

        const visitaId = resVisita.rows[0][0];

        await conn.execute(`
            UPDATE CANAL_VISITAS
            SET STATUS = 'REALIZADA', RETORNO = :ret, ATUALIZADO_EM = SYSDATE
            WHERE ID = :id
        `, { ret: feedbackText, id: visitaId }, { autoCommit: true });

        console.log(`[WebhookPoller] Retorno da visita ${visitaId} registrado pelo vendedor ${codvendedor}.`);
        await this.enviarMensagemBot(telefone, "✅ Seu retorno foi registrado com sucesso! Obrigado.", conn, instanceName);
        return true;
    }

    async enviarMensagemBot(telefone, texto, conn, instanceName) {
        try {
            const axios = require('axios');
            const resultTokens = await conn.execute(`
                SELECT API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL_BASE 
                FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst
            `, [instanceName]);

            if (resultTokens.rows.length > 0) {
                const apiToken = resultTokens.rows[0][0];
                const urlBase = resultTokens.rows[0][1];
                let p = telefone.startsWith('55') ? telefone : '55' + telefone;
                p = cacheService.getDestinoFinal(p);

                // Evolution API Padrão
                const urlEvo = `${urlBase}/message/sendText/${instanceName}`;
                const headersEvo = { 'Content-Type': 'application/json', 'apikey': apiToken };

                // Evo Go (Golang API)
                const urlEvoGo = `${urlBase}/send/text`;
                const headersEvoGo = { 'Content-Type': 'application/json', 'apikey': apiToken, 'instance': instanceName };

                console.log(`[WebhookPoller] Enviando msg BOT... Tentando Evolution API Padrão (${urlEvo})`);
                
                try {
                    const response = await axios.post(urlEvo, { number: p, text: texto }, { headers: headersEvo });
                    if (response.status >= 200 && response.status < 300) {
                        console.log(`[WebhookPoller] Mensagem do BOT enviada com sucesso para ${p} (Evo Padrão)`);
                    }
                } catch (e) {
                    if (e.response && e.response.status === 404) {
                        console.log(`[WebhookPoller] Rota padrão retornou 404. Tentando formato EVO GO (${urlEvoGo})...`);
                        const responseGo = await axios.post(urlEvoGo, { number: p, text: texto }, { headers: headersEvoGo });
                        if (responseGo.status >= 200 && responseGo.status < 300) {
                            console.log(`[WebhookPoller] Mensagem do BOT enviada com sucesso para ${p} (Evo Go). Data:`, JSON.stringify(responseGo.data));
                        } else {
                            console.log(`[WebhookPoller] Falha ao enviar Evo Go. Status:`, responseGo.status, responseGo.data);
                        }
                    } else {
                        throw e;
                    }
                }
            } else {
                console.error(`[WebhookPoller] Não encontrou token/URL para a instância: ${instanceName} no banco de dados!`);
            }
        } catch(e) {
            console.error('[WebhookPoller] Erro ao enviar resposta do bot:', e.message);
            if (e.response && e.response.data) {
                console.error('[WebhookPoller] Detalhes do Erro API Evo:', JSON.stringify(e.response.data));
            }
        }
    }

    async enviarDocumentoBot(telefone, base64Data, fileName, mimeType, conn, instanceName) {
        try {
            const axios = require('axios');
            const resultTokens = await conn.execute(`
                SELECT API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL_BASE 
                FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst
            `, [instanceName]);

            if (resultTokens.rows.length === 0) {
                console.error(`[WebhookPoller] Token/URL não encontrado para instância: ${instanceName}`);
                return;
            }

            const apiToken = resultTokens.rows[0][0];
            const urlBase  = resultTokens.rows[0][1];

            const cacheService = require('./cacheService');
            let p = telefone.startsWith('55') ? telefone : '55' + telefone;
            p = cacheService.getDestinoFinal(p);

            let cleanBase64 = base64Data;
            if (cleanBase64.includes('base64,')) {
                cleanBase64 = cleanBase64.split('base64,')[1];
            }

            const typeGo = mimeType.includes('image') ? 'image'
                         : mimeType.includes('video')  ? 'video'
                         : mimeType.includes('audio')  ? 'audio'
                         : 'document';

            // ── Tenta Evolution API Padrão (/message/sendMedia) ──────────────
            const urlEvo = `${urlBase}/message/sendMedia/${instanceName}`;
            const payloadEvo = {
                number:    p,
                mediatype: typeGo,
                mimetype:  mimeType,
                media:     cleanBase64,
                fileName:  fileName
            };

            console.log(`[WebhookPoller] Enviando doc BOT... Tentando Evo Padrão (${urlEvo})`);

            try {
                const response = await axios.post(urlEvo, payloadEvo, {
                    headers: { 'Content-Type': 'application/json', 'apikey': apiToken }
                });
                if (response.status >= 200 && response.status < 300) {
                    console.log(`[WebhookPoller] Doc do BOT enviado com sucesso para ${p} (Evo Padrão)`);
                    return;
                }
            } catch (e) {
                if (!e.response || e.response.status !== 404) throw e;
                // 404 → tenta Evo Go
            }

            // ── Evo Go: url = base64 puro (mesmo padrão do SAC que já funciona) ──
            const urlEvoGo     = `${urlBase}/send/media`;
            const payloadEvoGo = {
                number:   p,
                type:     typeGo,
                url:      cleanBase64,
                filename: fileName
            };

            console.log(`[WebhookPoller] Tentando Evo GO (${urlEvoGo})...`);

            const responseGo = await axios.post(urlEvoGo, payloadEvoGo, {
                headers: { 'Content-Type': 'application/json', 'apikey': apiToken, 'instance': instanceName }
            });
            if (responseGo.status >= 200 && responseGo.status < 300) {
                console.log(`[WebhookPoller] Doc do BOT enviado com sucesso para ${p} (Evo Go)`);
            }

        } catch(e) {
            console.error('[WebhookPoller] Erro ao enviar documento bot:', e.message);
            if (e.response) {
                console.error('[WebhookPoller] Status:', e.response.status, '| Body:', JSON.stringify(e.response.data));
            }
        }
    }

    async saveMessage(msgObj, instanceName, conn, originalMessage, audioBase64) {
        try {
            const resultTokens = await conn.execute(`
                SELECT CODUSUR, API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL_BASE 
                FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst
            `, [instanceName]);

            let codusur = null;
            let apiToken = null;
            let urlBase = null;
            if (resultTokens.rows.length > 0) {
                codusur = resultTokens.rows[0][0];
                apiToken = resultTokens.rows[0][1];
                urlBase = resultTokens.rows[0][2];
            } else {
                console.warn(`[WebhookPoller] Instância não cadastrada: ${instanceName}`);
                return;
            }
                    // --- Lógica de Download de Mídia (Áudio, Imagem, Vídeo, Documento) ---
            let mediaUrl = null;
            let mediaType = null;
            let mediaMime = null;
            let filePath = null;

            if (originalMessage && originalMessage.Message) {
                const msg = originalMessage.Message;
                let mediaInfo = msg.audioMessage || msg.imageMessage || msg.videoMessage || msg.documentMessage;
                
                if (mediaInfo) {
                    if (msg.audioMessage) mediaType = 'audio';
                    else if (msg.imageMessage) mediaType = 'image';
                    else if (msg.videoMessage) mediaType = 'video';
                    else if (msg.documentMessage) mediaType = 'document';

                    mediaMime = mediaInfo.mimetype || '';

                    try {
                        const axios = require('axios');
                        let subFolder = 'Documentos';
                        if (mediaType === 'image') subFolder = 'Imagens';
                        else if (mediaType === 'video') subFolder = 'Video';
                        else if (mediaType === 'audio' || mediaType === 'voice') subFolder = 'Audio';
                        
                        const uploadsDir = path.join(__dirname, '../../SAC/UPLOAD', subFolder);
                        if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                        
                        let ext = 'bin';
                        if (mediaMime.includes('audio/ogg')) ext = 'ogg';
                        else if (mediaMime.includes('audio/mp4')) ext = 'm4a';
                        else if (mediaMime.includes('audio/')) ext = 'mp3';
                        else if (mediaMime.includes('image/jpeg')) ext = 'jpg';
                        else if (mediaMime.includes('image/png')) ext = 'png';
                        else if (mediaMime.includes('video/mp4')) ext = 'mp4';
                        else if (mediaMime.includes('pdf')) ext = 'pdf';
                        else if (mediaInfo.fileName) {
                            const parts = mediaInfo.fileName.split('.');
                            if (parts.length > 1) ext = parts.pop();
                        }

                        const fileName = `${msgObj.id}.${ext}`;
                        filePath = path.join(uploadsDir, fileName);

                        // 1. Tenta usar o base64 que já veio no payload
                        if (!audioBase64 && urlBase && apiToken) {
                            try {
                                const response = await axios.post(
                                    `${urlBase}/chat/getBase64FromMediaMessage/${instanceName}`,
                                    { message: { key: { id: msgObj.id } } },
                                    { headers: { 'apikey': apiToken, 'Content-Type': 'application/json' } }
                                );
                                if (response.data && response.data.base64) {
                                    audioBase64 = response.data.base64;
                                }
                            } catch(e) {
                                console.warn('[WebhookPoller] Falha ao baixar via Evolution API (v1):', e.message);
                            }
                        }

                        if (!audioBase64 && urlBase && apiToken) {
                            // Tenta rota Evolution GO
                            try {
                                const downloadBody = { message: originalMessage.Message };
                                const goResponse = await axios.post(
                                    `${urlBase}/message/downloadmedia`,
                                    downloadBody,
                                    { headers: { 'apikey': apiToken, 'instance': instanceName, 'Content-Type': 'application/json' } }
                                );
                                if (goResponse.data) {
                                    audioBase64 = goResponse.data.base64 || (goResponse.data.data && goResponse.data.data.base64) || null;
                                }
                            } catch(e) {
                                console.warn('[WebhookPoller] Falha ao baixar via Evolution GO:', e.message);
                            }
                        }

                        // 2. Salva o arquivo em disco se tiver base64
                        if (audioBase64) {
                            let base64Data = audioBase64;
                            if (base64Data.includes('base64,')) {
                                base64Data = base64Data.split('base64,')[1];
                            }
                            fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                            console.log(`[WebhookPoller] Mídia salva em ${filePath}`);
                            mediaUrl = `/SAC/UPLOAD/${subFolder}/${fileName}`;
                        }
                    } catch(e) {
                        console.error('[WebhookPoller] Erro no processamento de mídia:', e);
                    }
                }
            }

            // 3. Transcreve com Groq (apenas se for áudio)
            let transcriptionText = null;
            if (mediaType === 'audio') {
                if (filePath && fs.existsSync(filePath)) {
                    try {
                        let groqKey = process.env.GROQ_API_KEY;
                        const groqResult = await conn.execute(
                            `SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`
                        );
                        if (groqResult.rows.length > 0 && groqResult.rows[0][0]) {
                            groqKey = groqResult.rows[0][0];
                        }

                        if (groqKey && groqKey !== 'SUA_CHAVE_AQUI') {
                            const OpenAI = require('openai');
                            const openai = new OpenAI({
                                apiKey: groqKey,
                                baseURL: 'https://api.groq.com/openai/v1',
                            });
                            const transcription = await openai.audio.transcriptions.create({
                                file: fs.createReadStream(filePath),
                                model: 'whisper-large-v3',
                                language: 'pt',
                            });
                            if (transcription && transcription.text) {
                                transcriptionText = transcription.text;
                                console.log(`[WebhookPoller] Audio transcrito: ${transcription.text}`);
                            }
                        } else {
                            console.warn('[WebhookPoller] GROQ_API_KEY não configurada. Transcrição pulada.');
                        }
                    } catch (tErr) {
                        console.error('[WebhookPoller] Erro na transcrição Groq:', tErr.message || tErr);
                    }
                } else {
                    console.warn(`[WebhookPoller] Arquivo de audio não encontrado para transcrever: ${filePath}. base64 disponível: ${!!audioBase64}`);
                }
            }

            let ticketId = null;
            let isVendedor = false;
            let estadoAtual = '';
            try {
                const stateRes = await conn.execute(`SELECT DADOS_TEMPORARIOS, ESTADO_ATUAL FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: msgObj.chat_id });
                if (stateRes.rows.length > 0) {
                    estadoAtual = stateRes.rows[0][1] || '';
                    if (estadoAtual.startsWith('VENDEDOR_')) {
                        isVendedor = true;
                    }

                    let rawData = stateRes.rows[0][0];
                    if (rawData && typeof rawData.getData === 'function') {
                        rawData = await rawData.getData();
                    }
                    if (rawData) {
                        const dados = JSON.parse(rawData);
                        if (dados.ticketId) ticketId = dados.ticketId;
                    }
                }
            } catch(e) {
                console.error('[WebhookPoller] Erro ao obter ticketId no saveMessage:', e);
            }
            
            if (isVendedor && estadoAtual !== 'VENDEDOR_ABRIR_TICKET_RELATO') {
                console.log(`[WebhookPoller] Mensagem ignorada pelo saveMessage pois o remetente está no fluxo do vendedor.`);
                return;
            }
            
            // Não busca mais automaticamente tickets abertos.
            // O ticketId será preenchido se o usuário estiver em qualquer bolha de Ticket que já tenha gerado o ID.

            const insertMessage = async (idMsg, textoStr, mUrl, mType, mMime, tipoStr) => {
                await conn.execute(`
                    INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE, TICKET_ID)
                    VALUES (:id, :cod, :tel, 'IN', :txt, :mUrl, :mType, :mMime, :tId)
                `, {
                    id: idMsg,
                    cod: codusur,
                    tel: msgObj.chat_id.replace('@s.whatsapp.net', '').replace('@g.us', '').substring(0, 20),
                    txt: textoStr,
                    mUrl: mUrl,
                    mType: mType,
                    mMime: mMime,
                    tId: ticketId
                }, { autoCommit: true });
            };

            if (ticketId) {
                if (mediaUrl) {
                    let tipoMidia = 'documento';
                    if (mediaType === 'image') tipoMidia = 'imagem';
                    else if (mediaType === 'audio') tipoMidia = 'audio';
                    else if (mediaType === 'video') tipoMidia = 'video';
                    
                    // Insere a mídia: TEXTO recebe a URL também
                    await insertMessage(msgObj.id, mediaUrl, mediaUrl, mediaType, mediaMime, tipoMidia);
                    
                    // Verifica se havia legenda / texto digitado além da mídia
                    let isPlaceholder = false;
                    if (msgObj.text && (msgObj.text.startsWith('[AUDIO]') || msgObj.text.startsWith('[DOCUMENTO]') || msgObj.text.startsWith('[IMAGEM]') || msgObj.text.startsWith('[VIDEO]') || msgObj.text.startsWith('[Mensagem não suportada'))) {
                        isPlaceholder = true;
                    }

                    if (msgObj.text && msgObj.text.trim().length > 0 && !isPlaceholder) {
                        await insertMessage(msgObj.id + '_legenda', msgObj.text, null, null, null, 'texto');
                    }
                    
                    if (transcriptionText) {
                        await insertMessage(msgObj.id + '_transcricao', `Transcrição do Áudio: ${transcriptionText}`, null, null, null, 'texto');
                    }
                } else {
                    // Mensagem de Texto Simples
                    await insertMessage(msgObj.id, msgObj.text, null, null, null, 'texto');
                }

                await conn.execute(`UPDATE CANAL_SAC_TICKETS SET ATUALIZADO_EM = SYSDATE WHERE ID = :tId`, { tId: ticketId }, { autoCommit: true });
            } else {
                if (transcriptionText) {
                    const transcricaoTag = `\n\n[TRANSCRICAO] ${transcriptionText}`;
                    const baseText = msgObj.text.substring(0, 3900);
                    msgObj.text = (baseText + transcricaoTag).substring(0, 4000);
                }

                await conn.execute(`
                    INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, MEDIA_URL, MEDIA_TYPE, MEDIA_MIMETYPE, TICKET_ID)
                    VALUES (:id, :cod, :tel, 'IN', :txt, :mUrl, :mType, :mMime, :tId)
                `, {
                    id: msgObj.id,
                    cod: codusur,
                    tel: msgObj.chat_id.replace('@s.whatsapp.net', '').replace('@g.us', '').substring(0, 20),
                    txt: msgObj.text,
                    mUrl: mediaUrl,
                    mType: mediaType,
                    mMime: mediaMime,
                    tId: ticketId
                }, { autoCommit: true });
            }
            
            console.log(`[WebhookPoller] Mensagem de ${msgObj.chat_id} salva para RCA ${codusur}`);
        } catch (dbErr) {
            if (dbErr.message.includes('ORA-00001')) return; // PK Duplicada (já salvo)
            console.error(`[WebhookPoller] Erro ao salvar mensagem:`, dbErr);
        }
    }
}

module.exports = WebhookPoller;
