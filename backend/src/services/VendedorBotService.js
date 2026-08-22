const oracledb = require('oracledb');
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
                
                case 'VENDEDOR_ASSISTENTE_COMUNICACAO':
                    return await this.processarAssistenteComunicacao(telefone, text, instanceName, conn, dados, codvendedor);
                
                case 'VENDEDOR_MINHAS_METAS':
                    return await this.processarMinhasMetas(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_STATUS':
                    return await this.processarTicketsStatus(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_SELECIONAR':
                    return await this.processarTicketsSelecionar(telefone, text, instanceName, conn, dados, codvendedor);

                case 'VENDEDOR_TICKETS_RESPONDER':
                    return await this.processarTicketsResponder(telefone, text, instanceName, conn, dados, codvendedor);

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
        const menuText = `💼 *Copiloto do Vendedor*\n\nOlá! Como posso te ajudar hoje?\n\n1️⃣ - 💬 Assistente de Comunicação\n2️⃣ - 📊 Minhas Metas\n3️⃣ - 🎫 Consultar Tickets da Carteira\n0️⃣ - Finalizar`;
        await this.webhookPoller.enviarMensagemBot(telefone, menuText, conn, instanceName);
    }

    async processarMenuPrincipal(telefone, text, instanceName, conn, codvendedor) {
        const opcao = (text || '').trim();
        switch (opcao) {
            case '1':
                await this.setState(telefone, 'VENDEDOR_ASSISTENTE_COMUNICACAO', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "💬 *Assistente de Comunicação*\n\nEm breve: Dicas de abordagem e mensagens prontas para seus clientes.\nDigite VOLTAR para retornar ao menu.", conn, instanceName);
                break;
            case '2':
                await this.setState(telefone, 'VENDEDOR_MINHAS_METAS', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "📊 *Minhas Metas*\n\nEm breve: Resumo de vendas e comissões do mês.\nDigite VOLTAR para retornar ao menu.", conn, instanceName);
                break;
            case '3':
                await this.setState(telefone, 'VENDEDOR_TICKETS_STATUS', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "🎫 *Consultar Tickets*\n\nQual status você deseja consultar?\n1 - Abertos\n2 - Em Atendimento\n\nDigite o número da opção desejada ou VOLTAR.", conn, instanceName);
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

    async processarAssistenteComunicacao(telefone, text, instanceName, conn, dados, codvendedor) {
        // Implementação futura
        await this.webhookPoller.enviarMensagemBot(telefone, "Módulo em desenvolvimento. Digite VOLTAR.", conn, instanceName);
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
            await this.webhookPoller.enviarMensagemBot(telefone, "Erro ao buscar tickets. Digite VOLTAR.", conn, instanceName);
        }
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
}

module.exports = VendedorBotService;
