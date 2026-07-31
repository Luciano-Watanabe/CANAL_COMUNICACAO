const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');
const cacheService = require('./cacheService');

const botReplyCache = new Map();

class WebhookPoller {
    constructor() {
        this.interval = null;
        this.isRunning = false;
        this.pollIntervalMs = 5000; // Poll every 5 seconds
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(() => this.poll(), this.pollIntervalMs);
        console.log('[WebhookPoller] Started polling JCWEBHOOK every 5s');
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
        try {
            conn = await oracledb.getConnection({
                user: process.env.ORACLE_USER,
                password: process.env.ORACLE_PASS,
                connectString: process.env.ORACLE_CONN_STR
            });

            // Get last processed ID
            const stateResult = await conn.execute(`SELECT LAST_PROCESSED_ID FROM CANAL_WEBHOOK_STATE WHERE ID = 1`);
            let lastId = 0;
            if (stateResult.rows.length > 0) {
                lastId = stateResult.rows[0][0];
            }

            // Fetch new webhooks
            const newWebhooks = await conn.execute(`
                SELECT ID, DT_REQUISICAO, CONTEUDO 
                FROM JCWEBHOOK 
                WHERE ORIGEM = 'whats' AND ID > :lastId 
                ORDER BY ID ASC
            `, [lastId]);

            let maxIdProcessed = lastId;

            for (const row of newWebhooks.rows) {
                const id = row[0];
                const dt = row[1];
                const clob = row[2];

                try {
                    let jsonString = '';
                    if (clob) {
                        jsonString = await clob.getData();
                    }

                    if (jsonString) {
                        const payload = JSON.parse(jsonString);
                
                        console.log(`[WebhookPoller] Novo webhook processado (ID: ${id}) - Evento: ${payload.event}`);

                        if (payload.event !== 'messages.upsert' && payload.event !== 'MESSAGES_UPSERT' && payload.event !== 'Message') {
                            console.log(`[WebhookPoller] Ignorando evento não-upsert: ${payload.event}`);
                            maxIdProcessed = id;
                            continue;
                        }
                        
                        await this.processPayload(payload, conn);
                    }
                } catch (parseErr) {
                    console.error(`[WebhookPoller] Erro ao parsear JSON do ID ${id}:`, parseErr);
                }

                maxIdProcessed = id;
            }

            // Update state
            if (maxIdProcessed > lastId) {
                await conn.execute(`UPDATE CANAL_WEBHOOK_STATE SET LAST_PROCESSED_ID = :maxId WHERE ID = 1`, [maxIdProcessed], { autoCommit: true });
            }

        } catch (err) {
            console.error('[WebhookPoller] Database error:', err);
        } finally {
            if (conn) {
                try { await conn.close(); } catch (e) {}
            }
            this.isRunning = false;
        }
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
            let audioBase64 = data.base64 || payload.base64 || (data.Message && data.Message.base64) || null;
            let originalMessage = data;

            if (data.Message) {
                textMessage = data.Message.conversation || 
                              data.Message.extendedTextMessage?.text;
                if (!textMessage) {
                    if (data.Message.audioMessage) {
                        isAudio = true;
                        textMessage = `[AUDIO]${info.ID}.ogg`;
                        console.log('AUDIO DETECTADO no GO! id=', info.ID);
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

            await this.saveMessage(msgObj, instanceName, conn, isAudio ? originalMessage : null, audioBase64);

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
        } else if (messageData.audioMessage) {
            fallbackIsAudio = true;
            fallbackTextMessage = `[AUDIO]${data.key.id}.ogg`;
            console.log('AUDIO DETECTADO no FALLBACK!');
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

        await this.saveMessage(fallbackMsgObj, fallbackInstanceName, conn, fallbackIsAudio ? fallbackOriginalMessage : null, fallbackAudioBase64);

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
            SELECT CODUSUR1 FROM PCCLIENT 
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(TELENT, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
               OR REPLACE(REPLACE(REPLACE(REPLACE(TELCOB, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
        `, { tel: telefone });
        
        if (result.rows.length > 0) return result.rows[0][0];

        // Se não encontrar direto, busca pelo CADASTRAR_CONTATOS (supondo que a estrutura da sua view já suporte)
        return null;
    }

    async findVendedorPorTelefone(telefone, conn) {
        const result = await conn.execute(`
            SELECT CODUSUR FROM PCUSUARI
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE1, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
               OR REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE2, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
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
            const fetch = require('node-fetch');
            const resultTokens = await conn.execute(`
                SELECT API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL_BASE 
                FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst
            `, [instanceName]);

            if (resultTokens.rows.length > 0) {
                const apiToken = resultTokens.rows[0][0];
                const urlBase = resultTokens.rows[0][1];
                let p = '55' + telefone;
                p = cacheService.getDestinoFinal(p);

                const url = `${urlBase}/message/sendText/${instanceName}`;
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': apiToken },
                    body: JSON.stringify({ number: p, text: texto })
                });
            }
        } catch(e) {
            console.error('[WebhookPoller] Erro ao enviar resposta do bot:', e.message);
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
               // --- Lógica de Download e Transcrição de Áudio ---
            if (originalMessage) {
                try {
                    const axios = require('axios');
                    const uploadsDir = path.join(__dirname, '../../uploads');
                    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
                    const filePath = path.join(uploadsDir, `${msgObj.id}.ogg`);

                    // 1. Tenta usar o base64 que já veio no payload do webhook
                    if (!audioBase64) {
                        // Tenta rota Evolution API padrão
                        if (urlBase && apiToken) {
                            try {
                                const response = await axios.post(
                                    `${urlBase}/chat/getBase64FromMediaMessage/${instanceName}`,
                                    { message: { key: { id: msgObj.id } } },
                                    { headers: { 'apikey': apiToken, 'Content-Type': 'application/json' } }
                                );
                                if (response.data && response.data.base64) {
                                    audioBase64 = response.data.base64;
                                    console.log('[WebhookPoller] base64 obtido via Evolution API');
                                }
                            } catch(e) {
                                console.warn('[WebhookPoller] Falha ao baixar via Evolution API:', e.response?.data || e.message);
                            }
                        }
                    }

                    if (!audioBase64 && urlBase && apiToken) {
                        // Tenta rota Evolution GO com o corpo correto
                        // O Evolution GO precisa dos campos do audioMessage mapeados do payload recebido
                        try {
                            const goInstanceName = instanceName;
                            const audioInfo = originalMessage.Message && originalMessage.Message.audioMessage;
                            
                            if (audioInfo) {
                                const downloadBody = {
                                    message: {
                                        audioMessage: {
                                            PTT: audioInfo.PTT || false,
                                            URL: audioInfo.URL || '',
                                            directPath: audioInfo.directPath || '',
                                            fileEncSHA256: audioInfo.fileEncSHA256 || '',
                                            fileLength: audioInfo.fileLength || 0,
                                            fileSHA256: audioInfo.fileSHA256 || '',
                                            mediaKey: audioInfo.mediaKey || '',
                                            mediaKeyTimestamp: audioInfo.mediaKeyTimestamp || 0,
                                            mimetype: audioInfo.mimetype || 'audio/ogg; codecs=opus',
                                            seconds: audioInfo.seconds || 0,
                                            waveform: audioInfo.waveform || ''
                                        }
                                    }
                                };
                                console.log('[WebhookPoller] Chamando Evolution GO /message/downloadmedia...');
                                const goResponse = await axios.post(
                                    `${urlBase}/message/downloadmedia`,
                                    downloadBody,
                                    { headers: { 'apikey': apiToken, 'instance': goInstanceName, 'Content-Type': 'application/json' } }
                                );
                                if (goResponse.data) {
                                    audioBase64 = goResponse.data.base64 || (goResponse.data.data && goResponse.data.data.base64) || null;
                                    if (audioBase64) console.log('[WebhookPoller] base64 obtido via Evolution GO');
                                    else console.warn('[WebhookPoller] Evolution GO respondeu mas sem base64:', JSON.stringify(goResponse.data).substring(0, 200));
                                }
                            } else {
                                console.warn('[WebhookPoller] originalMessage.Message.audioMessage não encontrado no payload');
                            }
                        } catch(e) {
                            console.warn('[WebhookPoller] Falha ao baixar via Evolution GO:', e.response?.data || e.message);
                        }
                    }

                    // 2. Salva o arquivo em disco se tiver base64
                    if (audioBase64) {
                        let base64Data = audioBase64;
                        if (base64Data.includes('base64,')) {
                            base64Data = base64Data.split('base64,')[1];
                        }
                        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
                        console.log(`[WebhookPoller] Audio salvo em ${filePath}`);
                    }

                    // 3. Transcreve com Groq (se o arquivo existir)
                    if (fs.existsSync(filePath)) {
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
                                    const transcricaoTag = `\n\n[TRANSCRICAO] ${transcription.text}`;
                                    // Garante que não ultrapasse 4000 chars do VARCHAR2
                                    const baseText = msgObj.text.substring(0, 3900);
                                    msgObj.text = (baseText + transcricaoTag).substring(0, 4000);
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
                } catch(e) {
                    console.error('[WebhookPoller] Erro no processamento de audio:', e);
                }
            }

            await conn.execute(`
                INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO)
                VALUES (:id, :cod, :tel, 'IN', :txt)
            `, {
                id: msgObj.id,
                cod: codusur,
                tel: msgObj.chat_id,
                txt: msgObj.text
            }, { autoCommit: true });
            
            console.log(`[WebhookPoller] Mensagem de ${msgObj.chat_id} salva para RCA ${codusur}`);
        } catch (dbErr) {
            if (dbErr.message.includes('ORA-00001')) return; // PK Duplicada (já salvo)
            console.error(`[WebhookPoller] Erro ao salvar mensagem:`, dbErr);
        }
    }
}

module.exports = WebhookPoller;
