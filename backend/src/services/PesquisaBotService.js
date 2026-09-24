const axios = require('axios');
const fs = require('fs');
const path = require('path');

const botMensagensService = require('./botMensagensService');

const TAG = '[PESQUISA-BOT]';

class PesquisaBotService {
    constructor(webhookPoller) {
        this.webhookPoller = webhookPoller;
    }

    async getState(telefone, conn) {
        const result = await conn.execute(`
            SELECT ESTADO_ATUAL, LOCAL_ATUAL, DADOS_TEMPORARIOS, (SYSDATE - CAST(ATUALIZADO_EM AS DATE)) * 24
            FROM CANAL_BOT_PESQUISA_STATE 
            WHERE TELEFONE = :tel
        `, { tel: telefone });

        if (result.rows.length > 0) {
            const estado = result.rows[0][0];
            const local = result.rows[0][1];
            const horasPassadas = result.rows[0][3];

            if (horasPassadas >= 24) {
                console.log(`${TAG} Estado de ${telefone} expirou após ${horasPassadas.toFixed(2)}h. Resetando para INICIO.`);
                await conn.execute(`DELETE FROM CANAL_BOT_PESQUISA_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                return { estado: 'INICIO', local: null, dados: {} };
            }

            let dados = {};
            try {
                let rawData = result.rows[0][2];
                if (rawData && typeof rawData.getData === 'function') {
                    rawData = await rawData.getData();
                }
                if (rawData) dados = JSON.parse(rawData);
            } catch(e) {
                console.error(`${TAG} Erro ao parsear DADOS_TEMPORARIOS:`, e);
            }
            return { estado, local, dados };
        }
        return { estado: 'INICIO', local: null, dados: {} };
    }

    async setState(telefone, estado, local, dados, conn) {
        const dadosStr = dados ? JSON.stringify(dados) : '{}';
        await conn.execute(`
            MERGE INTO CANAL_BOT_PESQUISA_STATE T
            USING (SELECT :tel AS TELEFONE, :est AS ESTADO_ATUAL, :loc AS LOCAL_ATUAL, :dados AS DADOS_TEMPORARIOS FROM DUAL) S
            ON (T.TELEFONE = S.TELEFONE)
            WHEN MATCHED THEN
                UPDATE SET T.ESTADO_ATUAL = S.ESTADO_ATUAL, T.LOCAL_ATUAL = S.LOCAL_ATUAL, T.DADOS_TEMPORARIOS = S.DADOS_TEMPORARIOS, T.ATUALIZADO_EM = SYSDATE
            WHEN NOT MATCHED THEN
                INSERT (TELEFONE, ESTADO_ATUAL, LOCAL_ATUAL, DADOS_TEMPORARIOS) VALUES (S.TELEFONE, S.ESTADO_ATUAL, S.LOCAL_ATUAL, S.DADOS_TEMPORARIOS)
        `, { tel: telefone, est: estado, loc: local || '', dados: dadosStr }, { autoCommit: true });
        console.log(`${TAG} [setState] ${telefone} → estado="${estado}" | local="${local}"`);
    }

    async handleMessage(telefone, text, instanceName, conn, isAudio, audioBase64, originalMessage, codusurBot, mediaUrl = null) {
        const { estado, local, dados } = await this.getState(telefone, conn);
        
        console.log(`${TAG} ══════════════════════════════════════════`);
        console.log(`${TAG} Mensagem recebida de: ${telefone}`);
        console.log(`${TAG} Estado atual: ${estado} | Local: ${local}`);
        console.log(`${TAG} Texto: "${text || ''}" | temBase64: ${!!audioBase64}`);

        const cmd = text ? text.toLowerCase().trim() : '';

        // Comandos de controle
        if (cmd === 'sair' || cmd === 'cancelar' || cmd === 'encerrar') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ENCERRAR'), conn, instanceName);
            await conn.execute(`DELETE FROM CANAL_BOT_PESQUISA_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
            return;
        }

        if (cmd === 'trocar local' || cmd === 'novo local') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_TROCAR_LOCAL'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_LOCAL', null, {}, conn);
            return;
        }

        // Fluxo de Estados
        if (estado === 'INICIO') {
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_INICIO'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_LOCAL', null, {}, conn);
            return;
        }

        if (estado === 'AGUARDANDO_LOCAL') {
            if (!text || text.length < 2) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_LOCAL_INVALIDO'), conn, instanceName);
                return;
            }
            const novoLocal = text.trim();
            const msgConfirmLocal = botMensagensService.getMsg('PESQUISA_CONFIRMA_LOCAL').replace(/\{\{local\}\}/g, novoLocal);
            await this.webhookPoller.enviarMensagemBot(telefone, msgConfirmLocal, conn, instanceName);
            
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', novoLocal, {}, conn);
            return;
        }

        if (estado === 'AGUARDANDO_FOTO_OU_EAN') {
            const hasImage = originalMessage && (
                (originalMessage.message && originalMessage.message.imageMessage) ||
                (originalMessage.Message && originalMessage.Message.imageMessage)
            );
            if (audioBase64 && hasImage) {
                // Tem uma imagem
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ANALISE_IMAGEM'), conn, instanceName);
                
                let imagemUrl = mediaUrl;
                if (!imagemUrl) {
                    try {
                        let rawBase64 = audioBase64;
                        if (rawBase64.startsWith('data:image')) {
                            rawBase64 = rawBase64.split(',')[1];
                        }
                        const filename = `pesquisa_${telefone}_${Date.now()}.jpg`;
                        const filepath = path.join(__dirname, '../../uploads', filename);
                        if (!fs.existsSync(path.join(__dirname, '../../uploads'))) {
                            fs.mkdirSync(path.join(__dirname, '../../uploads'), { recursive: true });
                        }
                        fs.writeFileSync(filepath, rawBase64, 'base64');
                        imagemUrl = `/uploads/${filename}`;
                    } catch (err) {
                        console.error(`${TAG} Erro ao salvar imagem da pesquisa:`, err);
                    }
                }

                let extractedData = await this.extractDataFromImageGroq(audioBase64, conn);
                
                if (!extractedData) {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_EXTRAIR'), conn, instanceName);
                    return;
                }
                
                if (!Array.isArray(extractedData)) {
                    extractedData = [extractedData]; // garante que seja array
                }

                let totalInseridos = 0;
                let msgsExtras = "";

                for (const item of extractedData) {
                    const { produto, preco, ean } = item;
                    if (!produto && !ean) continue;

                    const resBusca = await this.finalizarBuscaEInserir(telefone, local, produto, ean, preco, codusurBot, conn, instanceName, imagemUrl, true);
                    if (resBusca) {
                        totalInseridos++;
                        msgsExtras += `\n📦 *${resBusca.nomeProdutoBanco || 'Produto'}*`;
                        if (ean) msgsExtras += ` | EAN: ${ean}`;
                        if (preco) msgsExtras += ` | Concorrente: R$ ${parseFloat(preco).toFixed(2)}`;
                        if (resBusca.infoWinThor) msgsExtras += `\n   ↳ Sist: Cód ${resBusca.infoWinThor.codprod} - R$ ${parseFloat(resBusca.infoWinThor.preco || 0).toFixed(2)}\n`;
                        else msgsExtras += `\n   ↳ _Não encontrado no sistema._\n`;
                    }
                }
                
                if (totalInseridos === 0) {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_FALTA_INFO'), conn, instanceName);
                    return;
                }

                const respBase = botMensagensService.getMsg('PESQUISA_SUCESSO')
                                .replace(/\{\{local\}\}/g, local)
                                .replace(/\{\{produto\}\}/g, `${totalInseridos} produto(s) detectado(s)`)
                                .replace(/\{\{dados_extras\}\}/g, msgsExtras.trim());

                await this.webhookPoller.enviarMensagemBot(telefone, respBase, conn, instanceName);
                
                // Volta para aguardar próxima leitura
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
                await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', local, {}, conn);
                return;
            } else {
                // É texto, tentamos validar EAN ou "SEM EAN"
                const eanText = text ? text.trim().toUpperCase() : '';
                
                if (eanText === 'SEM EAN' || /^\d+$/.test(eanText)) {
                    const eanToSave = eanText === 'SEM EAN' ? null : eanText;
                    
                    await this.setState(telefone, 'AGUARDANDO_NOME_PRODUTO', local, { ean: eanToSave }, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_NOME'), conn, instanceName);
                } else {
                    await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_EAN_INVALIDO'), conn, instanceName);
                }
                return;
            }
        }

        if (estado === 'AGUARDANDO_NOME_PRODUTO') {
            if (!text || text.length < 2 || audioBase64) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_ENTENDER'), conn, instanceName);
                return;
            }
            
            dados.produto = text.trim();
            await this.setState(telefone, 'AGUARDANDO_PRECO', local, dados, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_PRECO'), conn, instanceName);
            return;
        }

        if (estado === 'AGUARDANDO_PRECO') {
            if (!text || audioBase64) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }
            
            let priceMatch = text.match(/[\d.,]+/);
            if (!priceMatch) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }
            
            let precoStr = priceMatch[0];
            if(precoStr.includes(',') && precoStr.includes('.')) {
               precoStr = precoStr.replace(/\./g, '').replace(',', '.');
            } else if (precoStr.includes(',')) {
               precoStr = precoStr.replace(',', '.');
            }
            
            const preco = parseFloat(precoStr);
            if (isNaN(preco)) {
                await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_ERRO_PRECO_INVALIDO'), conn, instanceName);
                return;
            }

            dados.preco = preco;
            await this.finalizarBuscaEInserir(telefone, local, dados.produto, dados.ean, dados.preco, codusurBot, conn, instanceName);
            
            // Volta pro loop
            await this.webhookPoller.enviarMensagemBot(telefone, botMensagensService.getMsg('PESQUISA_PEDIR_FOTO_EAN'), conn, instanceName);
            await this.setState(telefone, 'AGUARDANDO_FOTO_OU_EAN', local, {}, conn);
            return;
        }
    }

    async finalizarBuscaEInserir(telefone, local, produto, ean, preco, codusurBot, conn, instanceName, imagemUrl = null, pularMensagem = false) {
        // Busca no WinThor
        const infoWinThor = await this.buscarPrecoWinThor(ean, conn);
        
        // Salvar no banco
        let codprod = infoWinThor ? infoWinThor.codprod : null;
        let precoTabela = infoWinThor ? infoWinThor.preco : null;
        let custo = infoWinThor ? infoWinThor.custo : null;
        let nomeProdutoBanco = (infoWinThor && infoWinThor.descricao) ? infoWinThor.descricao : produto;

        // Insere
        try {
            const sqlInsert = `
                INSERT INTO CANAL_PESQUISA_PRECO (
                    TELEFONE_REMETENTE, LOCAL, PRODUTO_NOME, EAN, CODPROD, PRECO_ENCONTRADO, PRECO_TABELA, CUSTO, CODUSUR, IMAGEM_URL
                ) VALUES (
                    :tel, :loc, :prod, :ean, :codprod, :preco_enc, :preco_tab, :custo, :codusur, :imagem_url
                )
            `;
            const params = {
                tel: telefone,
                loc: local,
                prod: nomeProdutoBanco || 'Desconhecido',
                ean: ean || null,
                codprod: codprod || null,
                preco_enc: preco || null,
                preco_tab: precoTabela || null,
                custo: custo || null,
                codusur: codusurBot || null,
                imagem_url: imagemUrl
            };
            await conn.execute(sqlInsert, params, { autoCommit: true });
            console.log(`${TAG} Dados salvos com sucesso.`);
        } catch (err) {
            console.error(`${TAG} Erro ao salvar pesquisa:`, err);
        }

        // Montar resposta
        let dados_extras = '';
        if (ean) dados_extras += `🏷️ EAN: ${ean}\n`;
        if (preco) dados_extras += `💲 Preço Concorrente: R$ ${parseFloat(preco).toFixed(2)}\n`;

        if (infoWinThor) {
            dados_extras += `\n📊 *Dados Sistema (WinThor):*\n`;
            dados_extras += `Cód. Prod: ${infoWinThor.codprod}\n`;
            if (infoWinThor.descricao) dados_extras += `Descrição: ${infoWinThor.descricao}\n`;
        } else if (ean) {
            dados_extras += `\n⚠️ _Produto não encontrado no sistema com este EAN._\n`;
        }

        const resp = botMensagensService.getMsg('PESQUISA_SUCESSO')
                        .replace(/\{\{local\}\}/g, local)
                        .replace(/\{\{produto\}\}/g, nomeProdutoBanco || 'Não identificado')
                        .replace(/\{\{dados_extras\}\}/g, dados_extras.trim());
        
        if (!pularMensagem) {
            await this.webhookPoller.enviarMensagemBot(telefone, resp, conn, instanceName);
        }
        return { nomeProdutoBanco, infoWinThor, dados_extras };
    }

    async getGroqApiKey(conn) {
        const configRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
        if (configRes.rows.length > 0 && configRes.rows[0][0]) {
            return configRes.rows[0][0];
        }
        return process.env.GROQ_API_KEY;
    }

    async extractDataFromImageGroq(base64Image, conn) {
        const apiKey = await this.getGroqApiKey(conn);
        if (!apiKey) {
            console.error(`${TAG} GROQ_API_KEY não configurada.`);
            return null;
        }

        try {
            // Adjust payload base64 prefix if needed
            let imageContent = base64Image;
            if (!imageContent.startsWith('data:image')) {
                imageContent = `data:image/jpeg;base64,${imageContent}`;
            }

            const payload = {
                model: "qwen/qwen3.8-27b",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: "Extraia da imagem TODOS os produtos, identificando o nome do produto, o código EAN/Código de barras (se visível) e o preço.\n\nRetorne EXCLUSIVAMENTE um array de objetos JSON neste formato:\n[{\"produto\": \"Nome do produto\", \"preco\": 10.50, \"ean\": \"1234567890123\"}]\n\nSe não encontrar algum dado em um produto, envie null para ele. Se o preço estiver com vírgula, converta para float (ex: 10,50 vira 10.50). Certifique-se de listar TODOS os produtos legíveis na imagem."
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageContent
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.1
            };

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;
            return this.parseJsonResponse(content);

        } catch (err) {
            console.error(`${TAG} Erro ao chamar Groq Vision:`, err.response?.data || err.message);
            return null;
        }
    }

    async extractDataFromTextGroq(text, conn) {
        const apiKey = await this.getGroqApiKey(conn);
        if (!apiKey) {
            console.error(`${TAG} GROQ_API_KEY não configurada.`);
            return null;
        }

        try {
            const payload = {
                model: "llama3-70b-8192", // text only model is fine here
                messages: [
                    {
                        role: "system",
                        content: "Você é um extrator de dados. O usuário enviará um texto contendo dados de preço, produto e EAN.\nRetorne EXCLUSIVAMENTE um objeto JSON neste formato:\n{\"produto\": \"Nome\", \"preco\": 10.50, \"ean\": \"12345\"}\nSe faltar alguma info, mande null."
                    },
                    {
                        role: "user",
                        content: text
                    }
                ],
                temperature: 0.1
            };

            const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;
            return this.parseJsonResponse(content);

        } catch (err) {
            console.error(`${TAG} Erro ao chamar Groq Text:`, err.response?.data || err.message);
            return null;
        }
    }

    parseJsonResponse(content) {
        try {
            let jsonStr = content.trim();
            const startIdxArray = jsonStr.indexOf('[');
            const endIdxArray = jsonStr.lastIndexOf(']');
            const startIdxObj = jsonStr.indexOf('{');
            const endIdxObj = jsonStr.lastIndexOf('}');
            
            if (startIdxArray !== -1 && endIdxArray !== -1 && endIdxArray >= startIdxArray && (startIdxObj === -1 || startIdxArray < startIdxObj)) {
                jsonStr = jsonStr.substring(startIdxArray, endIdxArray + 1);
            } else if (startIdxObj !== -1 && endIdxObj !== -1 && endIdxObj >= startIdxObj) {
                jsonStr = jsonStr.substring(startIdxObj, endIdxObj + 1);
            }
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error(`${TAG} Falha ao parsear JSON da IA:`, content);
            return null;
        }
    }

    async buscarPrecoWinThor(ean, conn) {
        if (!ean) return null;

        try {
            const filial = process.env.ESTOQUE_CODFILIAL || '1';
            const regiao = process.env.TABPR_NUMREGIAO || '1';

            // 1. Achar codprod a partir da embalagem (PCEMBALAGEM / PCPRODUT)
            const sqlEmbalagem = `
                SELECT P.CODPROD, P.DESCRICAO 
                FROM PCPRODUT P
                JOIN PCEMBALAGEM E ON E.CODPROD = P.CODPROD
                WHERE E.CODAUXILIAR = :ean AND ROWNUM = 1
            `;
            const resProd = await conn.execute(sqlEmbalagem, { ean });
            
            if (resProd.rows.length === 0) return null;

            const codprod = resProd.rows[0][0];
            const descricao = resProd.rows[0][1];

            // 2. Achar Preço
            let preco = null;
            const sqlPreco = `SELECT PTABELA FROM PCTABPR WHERE CODPROD = :codprod AND NUMREGIAO = :regiao`;
            const resPreco = await conn.execute(sqlPreco, { codprod, regiao });
            if (resPreco.rows.length > 0) preco = resPreco.rows[0][0];

            // 3. Achar Custo
            let custo = null;
            const sqlCusto = `SELECT CUSTOFIN FROM PCEST WHERE CODPROD = :codprod AND CODFILIAL = :filial`;
            const resCusto = await conn.execute(sqlCusto, { codprod, filial });
            if (resCusto.rows.length > 0) custo = resCusto.rows[0][0];

            return { codprod, descricao, preco, custo };

        } catch (err) {
            console.error(`${TAG} Erro ao buscar no WinThor:`, err);
            return null;
        }
    }
}

module.exports = PesquisaBotService;
