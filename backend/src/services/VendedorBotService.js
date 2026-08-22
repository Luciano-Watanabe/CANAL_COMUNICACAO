const oracledb = require('oracledb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TAG = '[VENDEDOR-BOT]';

class VendedorBotService {
    constructor(webhookPoller) {
        this.webhookPoller = webhookPoller;
    }

    async getState(telefone, conn) {
        let timeoutHoras = 24;
        const result = await conn.execute(`
            SELECT ESTADO_ATUAL, DADOS_TEMPORARIOS, (SYSDATE - CAST(ATUALIZADO_EM AS DATE)) * 24
            FROM CANAL_BOT_STATE 
            WHERE TELEFONE = :tel
        `, { tel: telefone });

        if (result.rows.length > 0) {
            const estado = result.rows[0][0];
            const horasPassadas = result.rows[0][2];

            if (horasPassadas >= timeoutHoras) {
                await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                return { estado: 'VENDEDOR_MENU_PRINCIPAL', dados: {} };
            }

            let dados = {};
            try {
                let rawData = result.rows[0][1];
                if (rawData && typeof rawData.getData === 'function') {
                    rawData = await rawData.getData();
                }
                if (rawData) dados = JSON.parse(rawData);
            } catch(e) {}
            return { estado, dados };
        }
        return { estado: 'VENDEDOR_MENU_PRINCIPAL', dados: {} };
    }

    async setState(telefone, estado, dados, conn) {
        const dadosStr = dados ? JSON.stringify(dados) : '{}';
        await conn.execute(`
            MERGE INTO CANAL_BOT_STATE T
            USING (SELECT :tel AS TELEFONE, :est AS ESTADO_ATUAL, :dados AS DADOS_TEMPORARIOS FROM DUAL) S
            ON (T.TELEFONE = S.TELEFONE)
            WHEN MATCHED THEN
                UPDATE SET T.ESTADO_ATUAL = S.ESTADO_ATUAL, T.DADOS_TEMPORARIOS = S.DADOS_TEMPORARIOS, T.ATUALIZADO_EM = SYSDATE
            WHEN NOT MATCHED THEN
                INSERT (TELEFONE, ESTADO_ATUAL, DADOS_TEMPORARIOS) VALUES (S.TELEFONE, S.ESTADO_ATUAL, S.DADOS_TEMPORARIOS)
        `, { tel: telefone, est: estado, dados: dadosStr }, { autoCommit: true });
    }

    async handleMessage(telefone, text, instanceName, conn, isAudio, audioBase64, originalMessage, codvendedor) {
        const { estado, dados } = await this.getState(telefone, conn);
        const cmd = text ? text.toLowerCase().trim() : '';

        console.log(`${TAG} Mensagem de ${telefone} (Vendedor: ${codvendedor}) | Estado: ${estado} | Texto: ${text}`);

        if (cmd === 'cancelar' || cmd === 'menu' || cmd === 'voltar' || cmd === 'sair') {
            await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        try {
            switch (estado) {
                case 'VENDEDOR_MENU_PRINCIPAL':
                    return await this.processarMenuPrincipal(telefone, text, instanceName, conn, codvendedor);
                
                case 'VENDEDOR_ASSISTENTE_COMUNICACAO_BUSCA_CLIENTE':
                    return await this.processarAssistenteComunicacaoBuscaCliente(telefone, text, instanceName, conn, dados, codvendedor);
                
                case 'VENDEDOR_MINHAS_METAS':
                    return await this.processarMinhasMetas(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_STATUS':
                    return await this.processarTicketsStatus(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_SELECIONAR':
                    return await this.processarTicketsSelecionar(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_RESPONDER':
                    return await this.processarTicketsResponder(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_ABRIR_TICKET_BUSCA_CLIENTE':
                    return await this.processarBuscaClienteTicket(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_ABRIR_TICKET_DEPTO':
                    return await this.processarTicketDepto(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_ABRIR_TICKET_SUBDEPTO':
                    return await this.processarTicketSubDepto(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_ABRIR_TICKET_RELATO':
                    return await this.processarTicketRelato(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage, codvendedor);

                case 'VENDEDOR_CONSULTAR_CNPJ':
                    return await this.processarConsultarCnpj(telefone, text, instanceName, conn, dados, codvendedor);

                default:
                    await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
                    return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }
        } catch (error) {
            console.error(`${TAG} Erro no fluxo (estado="${estado}"):`, error);
            await this.webhookPoller.enviarMensagemBot(telefone, "Desculpe, ocorreu um erro. Digite VOLTAR.", conn, instanceName);
        }
    }

    async enviarMenuPrincipal(telefone, instanceName, conn) {
        const menuText = `💼 *Copiloto do Vendedor*\n\nOlá! Como posso te ajudar hoje?\n\n1️⃣ - 💬 Assistente de Comunicação\n2️⃣ - 📊 Minhas Metas\n3️⃣ - 🎫 Consultar Tickets da Carteira\n4️⃣ - 🎫 Abrir ticket para cliente\n5️⃣ - 🔍 Consultar CNPJ/CPF\n0️⃣ - Finalizar`;
        await this.webhookPoller.enviarMensagemBot(telefone, menuText, conn, instanceName);
    }

    async processarMenuPrincipal(telefone, text, instanceName, conn, codvendedor) {
        const opcao = (text || '').trim();
        switch (opcao) {
            case '1':
                await this.setState(telefone, 'VENDEDOR_ASSISTENTE_COMUNICACAO_BUSCA_CLIENTE', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "💬 *Assistente de Comunicação*\n\nQual CODCLI ou CNPJ/CPF do cliente que deseja analisar?\n\nDigite VOLTAR caso queira cancelar.", conn, instanceName);
                break;
            case '2':
                await this.setState(telefone, 'VENDEDOR_MINHAS_METAS', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "📊 *Minhas Metas*\n\nEm breve: Resumo de vendas e comissões do mês.\nDigite VOLTAR para retornar ao menu.", conn, instanceName);
                break;
            case '3':
                await this.setState(telefone, 'VENDEDOR_TICKETS_STATUS', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "🎫 *Consultar Tickets*\n\nQual status você deseja consultar?\n1 - Abertos\n2 - Em Atendimento\n\nDigite o número da opção desejada ou VOLTAR.", conn, instanceName);
                break;
            case '4':
                await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_BUSCA_CLIENTE', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "Qual CODCLI ou CNPJ do cliente?\n\nDigite VOLTAR caso queira cancelar.", conn, instanceName);
                break;
            case '5':
                await this.setState(telefone, 'VENDEDOR_CONSULTAR_CNPJ', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "🔍 *Consulta de Cadastro*\n\nDigite o *CNPJ* ou *CPF* que deseja consultar (apenas números).\n\nDigite VOLTAR para retornar ao menu.", conn, instanceName);
                break;
            case '0':
                await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, [telefone]);
                await this.webhookPoller.enviarMensagemBot(telefone, "Atendimento finalizado. Boa vendas!", conn, instanceName);
                break;
            default:
                await this.enviarMenuPrincipal(telefone, instanceName, conn);
                break;
        }
    }

    async processarAssistenteComunicacaoBuscaCliente(telefone, text, instanceName, conn, dados, codvendedor) {
        const busca = (text || '').replace(/[^0-9]/g, '');
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Código ou CNPJ inválido. Por favor, digite apenas números.\n\nQual CODCLI ou CNPJ/CPF do cliente?", conn, instanceName);
            return;
        }

        const sqlCli = `
            SELECT C.CODCLI, NVL(C.FANTASIA, C.CLIENTE), R.RAMO, C.CODUSUR1, 
                   TRUNC(SYSDATE - C.DTULTCOMP) AS DIAS_SEM_COMPRAR, C.CODATV1
            FROM PCCLIENT C
            LEFT JOIN PCATIVI R ON C.CODATV1 = R.CODATIV
            WHERE C.CODCLI = :busca OR REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca
            FETCH FIRST 1 ROWS ONLY
        `;
        const resCli = await conn.execute(sqlCli, { busca });

        if (resCli.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Cliente não encontrado. Verifique o código ou CNPJ e tente novamente.\n\nQual CODCLI ou CNPJ/CPF do cliente?", conn, instanceName);
            return;
        }

        const codusur1 = resCli.rows[0][3];
        if (String(codusur1) !== String(codvendedor)) {
            await this.webhookPoller.enviarMensagemBot(telefone, "⚠️ *Atenção:* Este cliente não pertence à sua carteira.\n\nPor favor, informe outro CODCLI ou CNPJ, ou digite VOLTAR para cancelar.", conn, instanceName);
            return;
        }

        const codcli = resCli.rows[0][0];
        const nomeCliente = String(resCli.rows[0][1] || '').trim();
        const ramoAtividade = resCli.rows[0][2] || 'Não informado';
        const diasSemComprar = resCli.rows[0][4] || 'Nunca comprou';
        const codramo = resCli.rows[0][5];

        await this.webhookPoller.enviarMensagemBot(telefone, `⏳ Analisando dados do cliente *${codcli} - ${nomeCliente}*... Por favor, aguarde.`, conn, instanceName);

        try {
            const sqlProdCli = `
                SELECT P.DESCRICAO, SUM(I.QT) as QT_TOTAL
                FROM PCPEDI I
                JOIN PCPEDC C ON I.NUMPED = C.NUMPED
                JOIN PCPRODUT P ON I.CODPROD = P.CODPROD
                WHERE C.CODCLI = :codcli
                AND C.DATA > ADD_MONTHS(SYSDATE, -6)
                GROUP BY P.DESCRICAO
                ORDER BY QT_TOTAL DESC
                FETCH FIRST 5 ROWS ONLY
            `;
            const resProdCli = await conn.execute(sqlProdCli, { codcli });
            const produtosCliente = resProdCli.rows.map(r => `- ${r[0]} (Qtd: ${r[1]})`).join('\n') || 'Nenhuma compra recente';

            let produtosSugeridos = 'Nenhum';
            if (codramo) {
                const sqlProdSugeridos = `
                    SELECT P.DESCRICAO, SUM(I.QT) AS QT_TOTAL
                    FROM PCPEDI I
                    JOIN PCPEDC C ON I.NUMPED = C.NUMPED
                    JOIN PCPRODUT P ON I.CODPROD = P.CODPROD
                    JOIN PCCLIENT CL ON C.CODCLI = CL.CODCLI
                    WHERE CL.CODATV1 = :codramo
                    AND C.DATA > ADD_MONTHS(SYSDATE, -6)
                    AND P.CODPROD NOT IN (
                        SELECT DISTINCT I2.CODPROD
                        FROM PCPEDI I2
                        JOIN PCPEDC C2 ON I2.NUMPED = C2.NUMPED
                        WHERE C2.CODCLI = :codcli
                    )
                    GROUP BY P.DESCRICAO
                    ORDER BY QT_TOTAL DESC
                    FETCH FIRST 5 ROWS ONLY
                `;
                const resProdSugeridos = await conn.execute(sqlProdSugeridos, { codramo, codcli });
                produtosSugeridos = resProdSugeridos.rows.map(r => `- ${r[0]}`).join('\n') || 'Nenhum sugerido';
            }

            const globalConfigRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'GROQ_API_KEY'`);
            let grokApiKey = globalConfigRes.rows.length > 0 ? globalConfigRes.rows[0][0] : process.env.GROQ_API_KEY;

            if (!grokApiKey) {
                await this.webhookPoller.enviarMensagemBot(telefone, "Aviso: Chave da IA (GROQ) não configurada. Fale com o administrador.", conn, instanceName);
                await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
                return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }

            const prompt = `Você é um Treinador de Vendas experiente e altamente persuasivo.
Seu objetivo é orientar o Vendedor a aumentar o valor do pedido (ticket médio), aumentar a recorrência de compra e aumentar a quantidade de SKUs comprados por este cliente.

Dados do Cliente:
- Nome: ${nomeCliente}
- Ramo de Atividade (Seguimento): ${ramoAtividade}
- Dias sem comprar: ${diasSemComprar}
- Produtos que mais comprou nos últimos 6 meses:
${produtosCliente}
- Produtos que outros clientes do mesmo seguimento compram, mas este cliente não compra:
${produtosSugeridos}

Por favor, forneça conselhos de abordagem curtos, diretos e práticos.
1. Uma breve análise do cenário do cliente.
2. Dicas de como argumentar para incluir os produtos sugeridos no próximo pedido.
3. Ideia de abordagem no WhatsApp para reativar/manter a recorrência.
Aja sempre em tom motivador para o Vendedor! Não use muitas hashtags. Seja objetivo.`;

            const grokRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'openai/gpt-oss-120b',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                max_tokens: 800
            }, {
                headers: {
                    'Authorization': `Bearer ${grokApiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            const resposta = grokRes.data.choices[0].message.content.trim();
            await this.webhookPoller.enviarMensagemBot(telefone, resposta, conn, instanceName);
        } catch (err) {
            console.error(`${TAG} Erro ao processar assistente de comunicação:`, err);
            await this.webhookPoller.enviarMensagemBot(telefone, "Desculpe, ocorreu um erro ao se comunicar com o Assistente (IA).", conn, instanceName);
        }

        await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
        await this.enviarMenuPrincipal(telefone, instanceName, conn);
    }

    async processarMinhasMetas(telefone, text, instanceName, conn, dados, codvendedor) {
        // Implementação futura
        await this.webhookPoller.enviarMensagemBot(telefone, "Módulo em desenvolvimento. Digite VOLTAR.", conn, instanceName);
    }

    async processarTicketsStatus(telefone, text, instanceName, conn, dados, codvendedor) {
        const opcao = (text || '').trim();
        let statusFilter = '';
        let statusName = '';

        if (opcao === '1') {
            statusFilter = 'ABERTO';
            statusName = 'Abertos';
        } else if (opcao === '2') {
            statusFilter = 'EM ATENDIMENTO';
            statusName = 'Em Atendimento';
        } else {
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção inválida.\nQual status você deseja consultar?\n1 - Abertos\n2 - Em Atendimento\n\nDigite o número da opção desejada ou VOLTAR.", conn, instanceName);
            return;
        }

        const sql = `
            WITH LATEST_LOG AS (
                SELECT TELEFONE, CODCLI_LOCALIZADO,
                       ROW_NUMBER() OVER(PARTITION BY TELEFONE ORDER BY DATA_HORA DESC) as RN
                FROM CANAL_LOG_IDENTIFICACAO_CLIENTE
            )
            SELECT T.ID, C.CLIENTE, T.DESCRICAO, T.TELEFONE
            FROM CANAL_SAC_TICKETS T
            LEFT JOIN LATEST_LOG L ON T.TELEFONE = L.TELEFONE AND L.RN = 1
            JOIN PCCLIENT C ON C.CODCLI = NVL(T.CODCLI, L.CODCLI_LOCALIZADO)
            WHERE C.CODUSUR1 = :codvendedor
              AND T.STATUS = :status
            ORDER BY T.ID DESC
            FETCH FIRST 10 ROWS ONLY
        `;

        try {
            const result = await conn.execute(sql, { codvendedor, status: statusFilter }, {
                fetchInfo: { "DESCRICAO": { type: oracledb.STRING } }
            });
            if (result.rows.length === 0) {
                await this.webhookPoller.enviarMensagemBot(telefone, `Nenhum ticket encontrado com o status *${statusName}* para os seus clientes.\nDigite VOLTAR.`, conn, instanceName);
                return;
            }

            let msg = `🎫 *Tickets ${statusName}*\n\n`;
            for (let row of result.rows) {
                const id = row[0];
                const cliente = row[1] ? row[1].substring(0, 25) : '';
                msg += `*#${id}* - ${cliente}\n`;
            }
            msg += `\nDigite o *Número do Ticket* (ID) que deseja visualizar e responder, ou digite VOLTAR.`;

            await this.setState(telefone, 'VENDEDOR_TICKETS_SELECIONAR', { statusFilter }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
        } catch (e) {
            console.error(`${TAG} Erro ao buscar tickets da carteira:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Erro ao enviar sua resposta. Tente novamente.", conn, instanceName);
        }
    }

    async processarBuscaClienteTicket(telefone, text, instanceName, conn, dados, codvendedor) {
        const busca = (text || '').replace(/[^0-9]/g, '');
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Código ou CNPJ inválido. Por favor, digite apenas números.\n\nQual CODCLI ou CNPJ do cliente?", conn, instanceName);
            return;
        }

        const sql = `
            SELECT CODCLI, CLIENTE, FANTASIA, CODUSUR1
            FROM PCCLIENT 
            WHERE CODCLI = :busca OR REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') = :busca
            FETCH FIRST 1 ROWS ONLY
        `;
        const result = await conn.execute(sql, { busca });

        if (result.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Cliente não encontrado. Verifique o código ou CNPJ e tente novamente.\n\nQual CODCLI ou CNPJ do cliente?", conn, instanceName);
            return;
        }

        const codusur1 = result.rows[0][3];
        if (String(codusur1) !== String(codvendedor)) {
            await this.webhookPoller.enviarMensagemBot(telefone, "⚠️ *Atenção:* Este cliente não pertence à sua carteira, portanto, você não pode abrir um ticket para ele.\n\nPor favor, informe outro CODCLI ou CNPJ, ou digite VOLTAR para cancelar.", conn, instanceName);
            return;
        }

        const codcli = result.rows[0][0];
        const nomeCliente = result.rows[0][2] || result.rows[0][1]; // NVL(FANTASIA,CLIENTE)
        
        let msg = `*${codcli} - ${nomeCliente}*\n\n`;

        // Busca departamentos do SAC
        const deptosRes = await conn.execute(`SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS WHERE DEPARTAMENTO_PAI_ID IS NULL AND ATIVO = 'S' ORDER BY NOME`);
        if (deptosRes.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Nenhum departamento de SAC configurado. Digite VOLTAR.", conn, instanceName);
            return;
        }

        msg += `Qual departamento deseja abrir o chamado?\n\n`;
        let deptos = [];
        let i = 1;
        for (const row of deptosRes.rows) {
            msg += `${i} - ${row[1]}\n`;
            deptos.push(row[0]);
            i++;
        }
        msg += "\nDigite o número correspondente ou VOLTAR.";

        await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_DEPTO', { codcli, deptosDisponiveis: deptos }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
    }

    async processarTicketDepto(telefone, text, instanceName, conn, dados, codvendedor) {
        const numIndex = parseInt(text.trim(), 10);
        const ids = dados.deptosDisponiveis || [];
        
        let selectedId = null;
        if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= ids.length) {
            selectedId = ids[numIndex - 1];
        }

        if (selectedId === null) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção inválida. Digite o número correspondente ao departamento.\nOu digite VOLTAR.", conn, instanceName);
            return;
        }

        const resSub = await conn.execute(`SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS WHERE DEPARTAMENTO_PAI_ID = :id AND ATIVO = 'S' ORDER BY NOME`, { id: selectedId });

        if (resSub.rows.length > 0) {
            let texto = "Selecione o Sub-departamento:\n\n";
            let subDeptos = [];
            let i = 1;
            for (const row of resSub.rows) {
                texto += `${i} - ${row[1]}\n`;
                subDeptos.push(row[0]);
                i++;
            }
            texto += "\nDigite o número correspondente ou VOLTAR.";

            await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_SUBDEPTO', { codcli: dados.codcli, idDeptoPai: selectedId, deptosDisponiveis: subDeptos }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, texto, conn, instanceName);
        } else {
            // Cria ticket direto
            const sql = `
                INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
                VALUES (:tel, :cli, :dep, 'Aguardando relato do vendedor...', 'ABERTO')
                RETURNING ID INTO :ticketId
            `;
            const resInsert = await conn.execute(sql, { tel: telefone, cli: dados.codcli, dep: selectedId, ticketId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } }, { autoCommit: true });
            const ticketId = resInsert.outBinds.ticketId[0];

            await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_RELATO', { idDepto: selectedId, codcli: dados.codcli, ticketId: ticketId }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, `Chamado *#${ticketId}* iniciado.\n\nAgora digite o texto, ou envie imagem, vídeo, ou áudio para abertura do chamado:`, conn, instanceName);
        }
    }

    async processarTicketSubDepto(telefone, text, instanceName, conn, dados, codvendedor) {
        const numIndex = parseInt(text.trim(), 10);
        const ids = dados.deptosDisponiveis || [];
        
        let selectedId = null;
        if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= ids.length) {
            selectedId = ids[numIndex - 1];
        }

        if (selectedId === null) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção inválida. Digite o número correspondente ao sub-departamento.\nOu digite VOLTAR.", conn, instanceName);
            return;
        }

        const sql = `
            INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
            VALUES (:tel, :cli, :dep, 'Aguardando relato do vendedor...', 'ABERTO')
            RETURNING ID INTO :ticketId
        `;
        const resInsert = await conn.execute(sql, { tel: telefone, cli: dados.codcli, dep: selectedId, ticketId: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } }, { autoCommit: true });
        const ticketId = resInsert.outBinds.ticketId[0];

        await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_RELATO', { idDepto: selectedId, codcli: dados.codcli, ticketId: ticketId }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, `Chamado *#${ticketId}* iniciado.\n\nAgora digite o texto, ou envie imagem, vídeo, ou áudio para abertura do chamado:`, conn, instanceName);
    }

    async processarTicketRelato(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage, codvendedor) {
        const ticketId = dados.ticketId;
        
        if (ticketId) {
            const descTexto = text || (isAudio ? '[Áudio recebido]' : (originalMessage && originalMessage.messageType !== 'conversation' ? `[Mídia recebida: ${originalMessage.messageType}]` : ''));
            
            await conn.execute(`
                UPDATE CANAL_SAC_TICKETS SET DESCRICAO = :descricao, ATUALIZADO_EM = SYSDATE WHERE ID = :id
            `, { descricao: descTexto, id: ticketId }, { autoCommit: true });
        }

        const msg = `✅ Chamado *#${ticketId}* aberto com sucesso!\n\nA equipe responsável já recebeu seu chamado.`;
        await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
        await this.enviarMenuPrincipal(telefone, instanceName, conn);
    }

    async processarTicketsSelecionar(telefone, text, instanceName, conn, dados, codvendedor) {
        const ticketId = (text || '').replace(/[^0-9]/g, '');
        if (!ticketId) {
            await this.webhookPoller.enviarMensagemBot(telefone, "ID inválido. Digite apenas o número do ticket, ou VOLTAR.", conn, instanceName);
            return;
        }

        const sql = `
            WITH LATEST_LOG AS (
                SELECT TELEFONE, CODCLI_LOCALIZADO,
                       ROW_NUMBER() OVER(PARTITION BY TELEFONE ORDER BY DATA_HORA DESC) as RN
                FROM CANAL_LOG_IDENTIFICACAO_CLIENTE
            )
            SELECT T.ID, C.CLIENTE, T.DESCRICAO, T.TELEFONE, T.STATUS
            FROM CANAL_SAC_TICKETS T
            LEFT JOIN LATEST_LOG L ON T.TELEFONE = L.TELEFONE AND L.RN = 1
            JOIN PCCLIENT C ON C.CODCLI = NVL(T.CODCLI, L.CODCLI_LOCALIZADO)
            WHERE T.ID = :id AND C.CODUSUR1 = :codvendedor
        `;

        try {
            const result = await conn.execute(sql, { id: ticketId, codvendedor }, {
                fetchInfo: { "DESCRICAO": { type: oracledb.STRING } }
            });
            if (result.rows.length === 0) {
                await this.webhookPoller.enviarMensagemBot(telefone, "Ticket não encontrado ou não pertence a um cliente da sua carteira. Digite o número correto ou VOLTAR.", conn, instanceName);
                return;
            }

            const row = result.rows[0];
            const cliente = row[1] || 'Desconhecido';
            const descricao = row[2] || '';
            const status = row[4];

            let msg = `🎫 *Detalhes do Ticket #${ticketId}*\n*Cliente:* ${cliente}\n*Status:* ${status}\n\n*Descrição / Último Relato:*\n${descricao}\n\n`;
            msg += `Para *adicionar uma resposta* neste ticket e enviá-la ao cliente, basta digitar o texto da sua resposta agora.\nPara cancelar e voltar, digite VOLTAR.`;

            await this.setState(telefone, 'VENDEDOR_TICKETS_RESPONDER', { ticketId, telefoneCliente: row[3] }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
        } catch (e) {
            console.error(`${TAG} Erro ao selecionar ticket:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Erro ao consultar ticket. Digite VOLTAR.", conn, instanceName);
        }
    }

    async processarTicketsResponder(telefone, text, instanceName, conn, dados, codvendedor) {
        if (!text) return;
        const ticketId = dados.ticketId;
        const telefoneCliente = dados.telefoneCliente;
        const msgId = 'VEND_' + Date.now();

        const respostaProCliente = `[Mensagem do seu Vendedor]\n\n${text}`;

        try {
            // 1. Enviar mensagem para o cliente via whatsapp (usando a mesma instância)
            await this.webhookPoller.enviarMensagemBot(telefoneCliente, respostaProCliente, conn, instanceName);

            // 2. Salvar no banco (CANAL_MENSAGENS) como SENTIDO='OUT' para ficar no histórico do Ticket no painel
            await conn.execute(`
                INSERT INTO CANAL_MENSAGENS (ID_MENSAGEM, CODUSUR, TELEFONE_CLIENTE, SENTIDO, TEXTO, STATUS, DATA_HORA, TICKET_ID)
                VALUES (:id_msg, :cod, :tel, 'OUT', :txt, 'ENVIADA', SYSDATE, :tId)
            `, {
                id_msg: msgId,
                cod: codvendedor, // Registra que o envio foi do vendedor
                tel: telefoneCliente,
                txt: respostaProCliente,
                tId: ticketId
            }, { autoCommit: true });

            // 3. Atualizar a data de atualização e mudar o status do ticket
            await conn.execute(`UPDATE CANAL_SAC_TICKETS SET STATUS = 'EM ATENDIMENTO', ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id: ticketId }, { autoCommit: true });

            await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, "✅ Resposta enviada ao cliente e registrada no ticket com sucesso!\nVoltando ao menu principal...", conn, instanceName);
            
            setTimeout(() => {
                this.enviarMenuPrincipal(telefone, instanceName, conn);
            }, 2000);
        } catch (e) {
            console.error(`${TAG} Erro ao responder ticket:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Ocorreu um erro ao enviar a resposta. Tente novamente ou digite VOLTAR.", conn, instanceName);
        }
    }

    async processarConsultarCnpj(telefone, text, instanceName, conn, dados, codvendedor) {
        const busca = (text || '').replace(/[^0-9]/g, '');
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "CNPJ/CPF inválido. Por favor, digite apenas números.\n\nDigite o CNPJ ou CPF para consultar, ou VOLTAR para cancelar.", conn, instanceName);
            return;
        }

        const sql = `
            SELECT 
                C.CODCLI, 
                NVL(C.FANTASIA, C.CLIENTE) AS NOME_CLIENTE, 
                TO_CHAR(C.DTCADASTRO, 'DD/MM/YYYY') AS DTCADASTRO, 
                C.CODUSUR1, 
                U.NOME AS NOME_VENDEDOR, 
                TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY') AS DTULTCOMP 
            FROM PCCLIENT C
            LEFT JOIN PCUSUARI U ON C.CODUSUR1 = U.CODUSUR
            WHERE REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca
        `;
        
        try {
            const result = await conn.execute(sql, { busca });

            if (result.rows.length === 0) {
                await this.webhookPoller.enviarMensagemBot(telefone, `Nenhum cadastro encontrado para o documento: *${busca}*.\n\nEste CNPJ/CPF está livre para prospecção.`, conn, instanceName);
            } else {
                let msg = `🔍 *Resultado da Consulta*\n\nForam encontrados ${result.rows.length} registro(s) para este documento:\n\n`;
                for (const row of result.rows) {
                    msg += `🏢 *Cliente:* ${row[0]} - ${row[1]}\n`;
                    msg += `📅 *Cadastro:* ${row[2] || 'N/A'}\n`;
                    msg += `👤 *Vendedor(a):* ${row[3]} - ${row[4] || 'Sem vínculo'}\n`;
                    msg += `🛒 *Última Compra:* ${row[5] || 'Nunca comprou'}\n`;
                    msg += `----------------------------\n`;
                }
                await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
            }
        } catch (e) {
            console.error(`${TAG} Erro ao consultar CNPJ/CPF ${busca}:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Ocorreu um erro ao realizar a consulta. Tente novamente.", conn, instanceName);
        }

        await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
        await this.enviarMenuPrincipal(telefone, instanceName, conn);
    }
}

module.exports = VendedorBotService;
