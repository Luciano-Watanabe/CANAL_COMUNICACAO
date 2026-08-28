const fs = require('fs');
const path = require('path');

// Prefixo para todos os logs do SAC Bot (facilita grep em tempo real)
const TAG = '[SAC-BOT]';

class SacBotService {
    constructor(webhookPoller) {
        this.webhookPoller = webhookPoller;
    }

    async getState(telefone, conn) {
        let timeoutHoras = 24; // Padrão: 24 horas
        try {
            const configRes = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'BOT_TIMEOUT_HORAS'`);
            if (configRes.rows.length > 0 && configRes.rows[0][0]) {
                const val = parseFloat(configRes.rows[0][0]);
                if (!isNaN(val) && val > 0) timeoutHoras = val;
            }
        } catch (e) {
            console.error('[SAC-BOT] Erro ao buscar configuração BOT_TIMEOUT_HORAS:', e);
        }

        const result = await conn.execute(`
            SELECT ESTADO_ATUAL, DADOS_TEMPORARIOS, (SYSDATE - CAST(ATUALIZADO_EM AS DATE)) * 24
            FROM CANAL_BOT_STATE 
            WHERE TELEFONE = :tel
        `, { tel: telefone });

        if (result.rows.length > 0) {
            const estado = result.rows[0][0];
            const horasPassadas = result.rows[0][2];

            if (horasPassadas >= timeoutHoras) {
                console.log(`[SAC-BOT] Estado de ${telefone} expirou após ${horasPassadas.toFixed(2)}h (limite: ${timeoutHoras}h). Resetando para MENU_PRINCIPAL.`);
                await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                return { estado: 'MENU_PRINCIPAL', dados: {} };
            }

            let dados = {};
            try {
                let rawData = result.rows[0][1];
                if (rawData && typeof rawData.getData === 'function') {
                    rawData = await rawData.getData();
                }
                if (rawData) dados = JSON.parse(rawData);
            } catch(e) {
                console.error('[SAC-BOT] Erro ao parsear DADOS_TEMPORARIOS:', e);
            }
            return { estado, dados };
        }
        return { estado: 'MENU_PRINCIPAL', dados: {} };
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
        console.log(`${TAG} [setState] ${telefone} → estado="${estado}" | dados=${dadosStr}`);
    }

    async handleMessage(telefone, text, instanceName, conn, isAudio, audioBase64, originalMessage) {
        const { estado, dados } = await this.getState(telefone, conn);
        
        console.log(`${TAG} ══════════════════════════════════════════`);
        console.log(`${TAG} Mensagem recebida de: ${telefone}`);
        console.log(`${TAG} Instância: ${instanceName}`);
        console.log(`${TAG} Estado atual: ${estado}`);
        console.log(`${TAG} Texto: "${text || ''}" | isAudio: ${isAudio || false} | temBase64: ${!!audioBase64}`);
        console.log(`${TAG} Dados temporários: ${JSON.stringify(dados)}`);

        const cmd = text ? text.toLowerCase().trim() : '';

        // ISOLAMENTO DE CONTEXTO (SAC_CHAT / TICKET ABERTO)
        if (estado === 'AGUARDANDO_TICKET_ACAO') {
            if (cmd === 'sair' || cmd === 'encerrar') {
                console.log(`${TAG} → Cliente solicitou sair da bolha do Ticket (SAC_CHAT). Voltando ao MENU_PRINCIPAL.`);
                await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
                return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }
            // Pula completamente a lógica de procurar comandos, menus ou saudações.
            // A mensagem já foi salva no ticket pelo webhookPoller.
            return;
        }

        if ((cmd === 'cancelar' || cmd === 'menu' || cmd === 'voltar' || cmd === 'sair' || cmd === 'encerrar' || cmd === '0') && !(estado === 'AGUARDANDO_AVALIACAO' && cmd === '0')) {
            if (cmd === '0' || cmd === 'encerrar') {
                if (estado === 'MENU_PRINCIPAL') {
                    console.log(`${TAG} → Opção 0/Encerrar no Menu Principal. Finalizando atendimento.`);
                    await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                    return await this.webhookPoller.enviarMensagemBot(telefone, "Atendimento finalizado. Se precisar de algo, basta mandar uma mensagem novamente. Até logo!", conn, instanceName);
                } else {
                    console.log(`${TAG} → Opção 0/Encerrar. Finalizando atendimento.`);
                    await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, { tel: telefone }, { autoCommit: true });
                    return await this.webhookPoller.enviarMensagemBot(telefone, "Atendimento finalizado. Se precisar de algo, basta mandar uma mensagem novamente. Até logo!", conn, instanceName);
                }
            } else {
                console.log(`${TAG} → Comando de voltar. Voltando ao MENU_PRINCIPAL.`);
                await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
                return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }
        }

        try {
            switch (estado) {
                case 'MENU_PRINCIPAL':
                    return await this.processarMenuPrincipal(telefone, text, instanceName, conn);
                
                case 'AGUARDANDO_PEDIDO_STATUS':
                    return await this.processarStatusPedido(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_NOTA_FINANCEIRO':
                    return await this.processarFinanceiro(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_CNPJ_CATALOGO':
                    return await this.processarCatalogoCNPJ(telefone, text, instanceName, conn, dados);

                case 'AGUARDANDO_FOTOS_DEVOLUCAO':
                    return await this.processarDevolucao(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage);
                
                case 'AGUARDANDO_CNPJ_CADASTRO':
                    return await this.processarCadastroCNPJ(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_SINTEGRA_CADASTRO':
                    return await this.processarCadastroSintegra(telefone, text, instanceName, conn, dados, audioBase64, originalMessage);
                
                case 'AGUARDANDO_DEPTO_TICKET':
                    return await this.processarTicketDepto(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_SUBDEPTO_TICKET':
                    return await this.processarTicketSubDepto(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_RELATO_TICKET':
                    return await this.processarTicketRelato(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_AVALIACAO':
                    return await this.processarAvaliacao(telefone, text, instanceName, conn, dados);

                case 'AGUARDANDO_CNPJ_TICKETS':
                    return await this.processarCNPJTickets(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_SELECAO_TICKET_LEITURA':
                    return await this.processarSelecaoTicketLeitura(telefone, text, instanceName, conn, dados);
                
                case 'AGUARDANDO_MENSAGEM_RESPOSTA_TICKET':
                    return await this.processarMensagemRespostaTicket(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage);

                case 'AGUARDANDO_CNPJ_GLOBAL':
                    return await this.processarCnpjGlobal(telefone, text, instanceName, conn, dados);

                default:
                    console.log(`${TAG} Estado desconhecido "${estado}". Resetando para MENU_PRINCIPAL.`);
                    await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
                    return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }
        } catch (error) {
            console.error(`${TAG} ❌ Erro no fluxo (estado="${estado}"):`, error);
            await this.webhookPoller.enviarMensagemBot(telefone, "Desculpe, ocorreu um erro ao processar sua solicitação. Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.", conn, instanceName);
        }
    }

    async enviarMenuPrincipal(telefone, instanceName, conn) {
        let nomeAtendente = "SAC";
        try {
            const res = await conn.execute(`SELECT NOME_ATENDENTE FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst`, [instanceName]);
            if (res.rows.length > 0 && res.rows[0][0]) {
                nomeAtendente = res.rows[0][0];
            }
        } catch(e) {}
        
        let nomeCliente = "";
        try {
            const sqlIdent = `
                SELECT NVL(CT.NOMECONTATO, NVL(C.FANTASIA, C.CLIENTE)) AS NOME
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
            `;
            const resIdent = await conn.execute(sqlIdent, { tel: telefone });
            if (resIdent.rows.length > 0 && resIdent.rows[0][0]) {
                nomeCliente = resIdent.rows[0][0];
            }
        } catch(e) {
            console.error(`${TAG} Erro ao buscar nome do cliente para saudação:`, e);
        }
        
        let saudacao = `Olá! Sou o assistente virtual do ${nomeAtendente}.`;
        if (nomeCliente) {
            saudacao = `Olá *${nomeCliente}*, sou o assistente virtual do ${nomeAtendente}.`;
        }

        console.log(`${TAG} [Menu Principal] Enviando menu para ${telefone} (atendente: ${nomeAtendente}, cliente: ${nomeCliente || 'Desconhecido'})`);
        const menuText = `${saudacao} Como posso te ajudar hoje?\nDigite o número da opção desejada:\n\n1️⃣ - Status de Pedido / Entrega\n2️⃣ - 2ª Via de Boleto e Notas Fiscais\n3️⃣ - Pegar Catálogo\n4️⃣ - Trocas e Devoluções\n5️⃣ - Quero me Cadastrar (Novos Clientes)\n6️⃣ - Falar com meu Vendedor\n7️⃣ - Abrir Chamado (Atendimento Humano)\n8️⃣ - Consultar ticket\n9️⃣ - Fornecedor\n0️⃣ - Finalizar Atendimento`;
        await this.webhookPoller.enviarMensagemBot(telefone, menuText, conn, instanceName);
    }

    async processarMenuPrincipal(telefone, text, instanceName, conn) {
        const opcao = (text || '').trim();
        console.log(`${TAG} [Menu Principal] ${telefone} digitou opção: "${opcao}"`);
        
        const contato = await this.identificarContato(telefone, conn);
        const isCliente = contato.type === 'cliente';

        if (!isCliente && !['0', '5', '9'].includes(opcao)) {
            // Options that require client auth: 1, 2, 3, 4, 6, 7, 8
            if (['1', '2', '3', '4', '6', '7', '8'].includes(opcao)) {
                await this.setState(telefone, 'AGUARDANDO_CNPJ_GLOBAL', { opcaoDesejada: opcao }, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, "Para acessar esta opção, por favor informe o seu *CNPJ* ou *CPF* (apenas números).", conn, instanceName);
                return;
            }
        }

        switch (opcao) {
            case '0':
                await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, [telefone]);
                await this.webhookPoller.enviarMensagemBot(telefone, "Atendimento finalizado. Qualquer nova mensagem iniciará um novo atendimento. Até logo!", conn, instanceName);
                break;
            case '1':
                if (isCliente && contato.cnpj) {
                    await this.processarStatusPedido(telefone, contato.cnpj, instanceName, conn, {});
                } else {
                    await this.setState(telefone, 'AGUARDANDO_PEDIDO_STATUS', {}, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Para consultar o status do seu pedido, por favor digite o *Número do Pedido* ou o *CNPJ* cadastrado (apenas números).", conn, instanceName);
                }
                break;
            case '2':
                if (isCliente && contato.cnpj) {
                    await this.processarFinanceiro(telefone, contato.cnpj, instanceName, conn, {});
                } else {
                    await this.setState(telefone, 'AGUARDANDO_NOTA_FINANCEIRO', {}, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Para baixar a 2ª via da Nota Fiscal ou Gerar PIX, por favor digite o *Número da Nota Fiscal* ou o seu *CNPJ*.", conn, instanceName);
                }
                break;
            case '3':
                if (isCliente) {
                    await this.gerarCatalogoDireto(telefone, contato.codcli, instanceName, conn);
                } else {
                    await this.setState(telefone, 'AGUARDANDO_CNPJ_CATALOGO', {}, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Para gerar o seu catálogo, por favor me informe o seu *CNPJ* (apenas números).", conn, instanceName);
                }
                break;
            case '4': {
                let codcli = isCliente ? contato.codcli : null;
                if (!codcli) {
                    const resCli = await conn.execute(`SELECT CODCLI FROM PCCLIENT WHERE TELCELENT = :t OR TELENT = :t OR TELCOM = :t OR TELCOB = :t FETCH FIRST 1 ROWS ONLY`, { t: telefone });
                    if (resCli.rows.length > 0) codcli = resCli.rows[0][0];
                }

                // Departamento fixo 41 - Troca e Devolução
                const idDepto = 41;

                const sql = `
                    INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
                    VALUES (:tel, :cli, :dep, 'Solicitação de Troca/Devolução via Bot. Aguardando arquivos e relato.', 'ABERTO')
                    RETURNING ID INTO :ticketId
                `;
                const resInsert = await conn.execute(sql, { 
                    tel: telefone, 
                    cli: codcli, 
                    dep: idDepto,
                    ticketId: { type: require('oracledb').NUMBER, dir: require('oracledb').BIND_OUT }
                }, { autoCommit: true });
                const ticketId = resInsert.outBinds.ticketId[0];

                await this.setState(telefone, 'AGUARDANDO_FOTOS_DEVOLUCAO', { etapa: 'inicio', tsInicio: Date.now(), ticketId: ticketId }, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, `Você entrou no menu de Trocas e Devoluções.\nSeu chamado foi iniciado sob o número *#${ticketId}*.\nPor favor, envie as *FOTOS* do produto, da caixa e um breve relato do problema.\n\nQuando terminar de enviar, digite *OK* para eu registrar, ou *0* para voltar.`, conn, instanceName);
                break;
            }
            case '5':
                if (isCliente) {
                    await this.webhookPoller.enviarMensagemBot(telefone, "Você já possui cadastro conosco! Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.", conn, instanceName);
                } else {
                    await this.setState(telefone, 'AGUARDANDO_CNPJ_CADASTRO', {}, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Para iniciar seu cadastro, por favor digite o seu *CNPJ* (apenas números).", conn, instanceName);
                }
                break;
            case '6':
                await this.processarFalarComVendedor(telefone, instanceName, conn, isCliente ? contato.codcli : null);
                break;
            case '7':
                await this.enviarMenuDepartamentosTicket(telefone, instanceName, conn);
                break;
            case '8':
                if (isCliente && contato.cnpj) {
                    await this.processarListarTickets(telefone, contato.cnpj, instanceName, conn, {});
                } else {
                    await this.setState(telefone, 'AGUARDANDO_CNPJ_TICKETS', {}, conn);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Para consultar seus tickets, por favor digite o seu *CNPJ* (apenas números) ou digite *1* para buscar os tickets vinculados a este número de telefone.", conn, instanceName);
                }
                break;
            case '9':
                await this.processarFornecedor(telefone, instanceName, conn);
                break;
            default:
                console.log(`${TAG} [Menu Principal] Opção inválida "${opcao}" de ${telefone}. Reenviando menu.`);
                await this.enviarMenuPrincipal(telefone, instanceName, conn);
                break;
        }
    }

    async processarCnpjGlobal(telefone, text, instanceName, conn, dados) {
        const busca = text.replace(/[^0-9]/g, '');
        console.log(`${TAG} [Global CNPJ] ${telefone} informou CNPJ: "${busca}" para opção "${dados.opcaoDesejada}"`);
        
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "CNPJ ou CPF inválido. Digite apenas números.\n\nPara voltar ao menu, digite VOLTAR.", conn, instanceName);
            return;
        }

        const sqlCli = `SELECT CODCLI FROM PCCLIENT WHERE REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') = :cnpj FETCH FIRST 1 ROWS ONLY`;
        const resCli = await conn.execute(sqlCli, { cnpj: busca });

        let achou = 'N';
        let codcliLocalizado = null;

        if (resCli.rows.length > 0) {
            codcliLocalizado = resCli.rows[0][0];
            achou = 'S';
        }

        // Salva na tabela de log
        try {
            await conn.execute(`
                INSERT INTO CANAL_LOG_IDENTIFICACAO_CLIENTE 
                (TELEFONE, DOCUMENTO_INFORMADO, CODCLI_LOCALIZADO, OPCAO_USADA)
                VALUES (:tel, :doc, :cli, :opc)
            `, { tel: telefone, doc: busca, cli: codcliLocalizado, opc: 'OPCAO_' + dados.opcaoDesejada }, { autoCommit: true });
        } catch(e) {
            console.error(`${TAG} Erro ao salvar log de identificacao:`, e);
        }

        if (achou === 'S') {
            await this.setState(telefone, 'MENU_PRINCIPAL', { codcliAutenticado: codcliLocalizado }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, "Identificação confirmada! Um momento...", conn, instanceName);
            await this.processarMenuPrincipal(telefone, dados.opcaoDesejada, instanceName, conn);
        } else {
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, "O CNPJ/CPF informado não está cadastrado.\nPor favor, vá à *opção 5* e solicite o cadastro.\nVoltando ao menu principal...", conn, instanceName);
            setTimeout(() => {
                this.enviarMenuPrincipal(telefone, instanceName, conn);
            }, 1500);
        }
    }

    async processarStatusPedido(telefone, text, instanceName, conn, dados) {
        const busca = text.replace(/[^0-9]/g, '');
        console.log(`${TAG} [Status Pedido] ${telefone} buscando: "${busca}" (original: "${text}")`);

        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não identifiquei números na sua resposta. Por favor, digite o número do pedido ou CNPJ (apenas números).\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        let sql = `
            SELECT P.NUMPED, 
                   DECODE(P.POSICAO, 'F', 'Faturado', 'M', 'Aguardando Faturamento', 'L', 'Aguardando Separação', 'B', 'Aguardando Liberação', 'P', 'Aguardando Liberação', 'C', 'Cancelado', P.POSICAO) AS POSICAO, 
                   P.VLTOTAL, P.DATA 
            FROM PCPEDC P 
            LEFT JOIN PCCLIENT C ON P.CODCLI = C.CODCLI
            WHERE (P.NUMPED = :busca OR REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca)
            ORDER BY P.DATA DESC
            FETCH FIRST 3 ROWS ONLY
        `;
        const result = await conn.execute(sql, { busca });
        console.log(`${TAG} [Status Pedido] Query retornou ${result.rows.length} linha(s) para "${busca}"`);

        if (result.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não encontrei nenhum pedido recente com esse número ou CNPJ.\nVerifique e tente novamente.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        let resposta = "📦 *Status dos seus últimos pedidos:*\n\n";
        for (const row of result.rows) {
            const numped = row[0];
            const posicao = row[1];
            const vlTotal = (row[2] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const data = row[3] ? row[3].toLocaleDateString('pt-BR') : 'N/A';
            console.log(`${TAG} [Status Pedido] Pedido ${numped} | Posição: ${posicao} | Valor: ${vlTotal} | Data: ${data}`);
            resposta += `*Pedido:* ${numped}\n*Data:* ${data}\n*Valor:* ${vlTotal}\n*Status Atual:* ${posicao}\n\n`;
        }

        resposta += "Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.";
        await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, resposta, conn, instanceName);
    }

    async processarFinanceiro(telefone, text, instanceName, conn, dados) {
        const busca = text.replace(/[^0-9]/g, '');
        console.log(`${TAG} [Financeiro] ${telefone} buscando nota: "${busca}"`);

        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não identifiquei números na sua resposta. Por favor, digite o número da nota (apenas números).\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        let sqlNF = `
            SELECT N.NUMNOTA, N.VLTOTAL, F.CGC, F.RAZAOSOCIAL, F.CIDADE, N.CHAVENFE, N.NUMPED, N.CODCLI, N.CODCOB
            FROM PCNFSAID N
            JOIN PCFILIAL F ON F.CODIGO = N.CODFILIAL
            JOIN PCCLIENT C ON C.CODCLI = N.CODCLI
            WHERE (N.NUMNOTA = :busca OR N.NUMPED = :busca OR REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca)
            ORDER BY N.DTSAIDA DESC
            FETCH FIRST 1 ROWS ONLY
        `;
        
        try {
            const result = await conn.execute(sqlNF, { busca });
            console.log(`${TAG} [Financeiro] Query NF retornou ${result.rows.length} linha(s) para "${busca}"`);

            if (result.rows.length > 0) {
                const numnota = result.rows[0][0];
                const vltotal = result.rows[0][1];
                const cgc = result.rows[0][2];
                const razao = result.rows[0][3] ? result.rows[0][3].substring(0,25) : '';
                const cidade = result.rows[0][4] ? result.rows[0][4].substring(0,15) : '';
                const chaveNFe = result.rows[0][5] || '';
                const numped = result.rows[0][6] || '';
                const codcli = result.rows[0][7] || '';
                const codcob = result.rows[0][8] ? String(result.rows[0][8]).trim() : '';
                console.log(`${TAG} [Financeiro] NF encontrada: ${numnota} | R$ ${vltotal} | ${razao} | COB: ${codcob}`);
                
                let pixCopiaCola = '';
                const isBoleto = codcob === '237' || codcob === '341';

                if (!isBoleto) {
                    try {
                        const pixRes = await conn.execute(`SELECT GERA_PIX(:cgc, :numnota, :vltotal, :razao, :cidade) FROM DUAL`, {
                            cgc: cgc, numnota: numnota.toString(), vltotal: vltotal, razao: razao, cidade: cidade
                        });
                        pixCopiaCola = pixRes.rows[0][0];
                        console.log(`${TAG} [Financeiro] PIX gerado: ${pixCopiaCola ? 'sim' : 'não (sem função GERA_PIX?)'}`);
                    } catch(err) {
                        console.error(`${TAG} [Financeiro] Erro ao gerar PIX:`, err.message);
                    }
                }

                let msg = `🧾 *Nota Fiscal Localizada!*\n\n*Número:* ${numnota}\n*Valor:* R$ ${vltotal}\n*Chave NFe:* ${chaveNFe}\n\n`;
                
                if (pixCopiaCola) {
                    msg += `📲 *PIX Copia e Cola:*\n\n${pixCopiaCola}\n\nO QR Code será enviado em seguida!\n\nPor favor, envie o comprovante do PIX por ticket na Opção 7 do menu principal (Financeiro > Comprovante PIX) ou envie ao vendedor que o atende.`;
                }
                
                await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);

                if (pixCopiaCola) {
                    try {
                        const QRCode = require('qrcode');
                        const qrDataURL = await QRCode.toDataURL(pixCopiaCola);
                        const base64Data = qrDataURL.split('base64,')[1];
                        await this.enviarDocumentoBase64(telefone, base64Data, 'image/png', 'QRCode_PIX.png', instanceName, conn);
                        console.log(`${TAG} [Financeiro] QR Code enviado para ${telefone}`);
                    } catch (err) {
                        console.error(`${TAG} [Financeiro] Erro QRCode:`, err);
                    }
                }

                const PdfGeneratorService = require('./PdfGeneratorService');
                
                try {
                    // Buscar o XML da NFe no banco
                    let sqlXml = `
                        SELECT PCDOCELETRONICO.XMLNFE 
                        FROM PCDOCELETRONICO 
                        JOIN PCNFSAID ON PCNFSAID.NUMTRANSVENDA = PCDOCELETRONICO.NUMTRANSACAO
                        WHERE PCNFSAID.NUMNOTA = :numnota 
                        FETCH FIRST 1 ROWS ONLY
                    `;
                    const resXml = await conn.execute(sqlXml, { numnota });
                    if (resXml.rows.length > 0 && resXml.rows[0][0]) {
                        const xmlString = resXml.rows[0][0];
                        const pdfBase64 = await PdfGeneratorService.gerarDanfe(xmlString);
                        await this.enviarDocumentoBase64(telefone, pdfBase64, 'application/pdf', `DANFE_${numnota}.pdf`, instanceName, conn);
                        console.log(`${TAG} [Financeiro] DANFE da NFe enviada para ${telefone} (Gerada Dinamicamente)`);
                    } else {
                        await this.webhookPoller.enviarMensagemBot(telefone, "O arquivo PDF desta Nota Fiscal ainda não está disponível no sistema (XML não encontrado).", conn, instanceName);
                    }
                } catch (err) {
                    console.error(`${TAG} [Financeiro] Erro ao gerar DANFE:`, err);
                    await this.webhookPoller.enviarMensagemBot(telefone, "Ocorreu um erro ao tentar gerar o PDF da Nota Fiscal.", conn, instanceName);
                }

                // Gerar Boleto se for aplicável
                if (isBoleto) {
                    try {
                        let sqlBoleto = `
                            SELECT P.VALOR, P.DTVENC, P.DTEMISSAO, P.NOSSONUMBCO, P.LINHADIG, P.CODBARRA, P.CODBANCO,
                                   B.AGENCIA, B.CONTA, B.NUMCARTEIRA
                            FROM PCPREST P
                            LEFT JOIN PCBANCO B ON P.CODBANCO = B.CODBANCO
                            WHERE P.DUPLIC = :numnota AND P.DTBAIXA IS NULL
                            ORDER BY P.PREST
                            FETCH FIRST 1 ROWS ONLY
                        `;
                        const resBoleto = await conn.execute(sqlBoleto, { numnota });
                        if (resBoleto.rows.length > 0) {
                            const [valorBoleto, dtVenc, dtEmissao, nossoNum, linhaDig, codBarra, codBanco, agencia, conta, carteira] = resBoleto.rows[0];
                            // Chama a geração do PDF do Boleto
                            const pdfBoletoBase64 = await PdfGeneratorService.gerarBoleto({
                                valor: valorBoleto,
                                dataVencimento: dtVenc,
                                dataEmissao: dtEmissao,
                                nossoNumero: nossoNum,
                                linhaDigitavel: linhaDig,
                                codigoBarras: codBarra,
                                banco: codBanco,
                                numnota: numnota,
                                razao: razao,
                                cgc: cgc,
                                dtVencimento: dtVenc,
                                agencia: agencia,
                                conta: conta,
                                carteira: carteira
                            });

                            
                            if (pdfBoletoBase64) {
                                await this.enviarDocumentoBase64(telefone, pdfBoletoBase64, 'application/pdf', `Boleto_${numnota}.pdf`, instanceName, conn);
                                console.log(`${TAG} [Financeiro] Boleto enviado para ${telefone}`);
                            }
                        }
                    } catch (err) {
                        console.error(`${TAG} [Financeiro] Erro ao gerar Boleto:`, err);
                        await this.webhookPoller.enviarMensagemBot(telefone, "Ocorreu um erro ao tentar gerar o PDF do Boleto.", conn, instanceName);
                    }
                }


                await this.webhookPoller.enviarMensagemBot(telefone, "Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.", conn, instanceName);
                await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);

            } else {
                 await this.webhookPoller.enviarMensagemBot(telefone, `Não encontrei nenhuma Nota Fiscal para o número *${busca}*.\nVerifique e tente novamente.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.`, conn, instanceName);
            }
        } catch(e) {
            console.error(`${TAG} [Financeiro] Erro:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Erro ao buscar a nota. Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.", conn, instanceName);
        }
    }

    async processarCatalogoCNPJ(telefone, text, instanceName, conn, dados) {
        const busca = text.replace(/[^0-9]/g, '');
        console.log(`${TAG} [Catálogo CNPJ] ${telefone} buscando CNPJ: "${busca}"`);

        if (text.trim() === '0') {
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "CNPJ inválido. Digite apenas números.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        const sqlCli = `SELECT CODCLI FROM PCCLIENT WHERE REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') = :cnpj FETCH FIRST 1 ROWS ONLY`;
        const resCli = await conn.execute(sqlCli, { cnpj: busca });

        if (resCli.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, `Não encontrei nenhum cliente com este CNPJ.\nVerifique e tente novamente.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.`, conn, instanceName);
            return;
        }

        const codcli = resCli.rows[0][0];
        await this.gerarCatalogoDireto(telefone, codcli, instanceName, conn);
    }

    async gerarCatalogoDireto(telefone, codcli, instanceName, conn) {
        console.log(`${TAG} [Catálogo] Gerando catálogo direto para CODCLI: ${codcli}`);

        const sqlRamo = `
            SELECT A.CODATIV, A.RAMO 
            FROM PCATIVI A
            JOIN PCCLIENT C ON C.CODATV1 = A.CODATIV
            WHERE C.CODCLI = :codcli
        `;
        const resRamo = await conn.execute(sqlRamo, { codcli });

        if (resRamo.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não encontrei um Ramo de Atividade vinculado ao seu cadastro.", conn, instanceName);
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            return;
        }

        const codatv = resRamo.rows[0][0];
        const nomeRamo = resRamo.rows[0][1] ? resRamo.rows[0][1].trim() : '';
        console.log(`${TAG} [Catálogo] Ramo identificado: ${codatv} - ${nomeRamo}. Gerando PDF...`);
        
        await this.webhookPoller.enviarMensagemBot(telefone, `Gerando o catálogo em PDF para o ramo *${nomeRamo}*. Isso pode demorar alguns segundos, aguarde...`, conn, instanceName);
        
        try {
            const sqlProdutos = `
                WITH CLIENTES_ATIVIDADE AS (
                    SELECT CODCLI FROM PCCLIENT WHERE CODATV1 = :codatv
                ),
                COMPRAS_GERAIS AS (
                    SELECT M.CODPROD
                    FROM PCMOV M
                    JOIN CLIENTES_ATIVIDADE CA ON CA.CODCLI = M.CODCLI
                    WHERE M.CODOPER = 'S' AND M.DTMOV >= SYSDATE - 180
                    GROUP BY M.CODPROD
                )
                SELECT 
                    P.CODPROD, 
                    P.DESCRICAO, 
                    NVL(PR.PVENDA, 0) AS PVENDA,
                    P.UNIDADE,
                    P.CODAUXILIAR
                FROM PCPRODUT P
                JOIN PCEST E ON E.CODPROD = P.CODPROD AND E.CODFILIAL = '1'
                JOIN COMPRAS_GERAIS CG ON CG.CODPROD = P.CODPROD
                LEFT JOIN PCTABPR PR ON PR.CODPROD = P.CODPROD AND PR.NUMREGIAO = 1
                WHERE NVL(P.OBS2, 'X') NOT IN ('FL')
                AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
                ORDER BY P.DESCRICAO
                FETCH FIRST 50 ROWS ONLY
            `;
            const resProd = await conn.execute(sqlProdutos, { codatv });
            console.log(`${TAG} [Catálogo] ${resProd.rows.length} produto(s) encontrado(s) para ${nomeRamo}`);

            let catalogoComPreco = false;
            try {
                const resConf = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'BOT_CATALOGO_COM_PRECO'`);
                if (resConf.rows.length > 0 && resConf.rows[0][0] === 'ON') {
                    catalogoComPreco = true;
                }
            } catch (e) {
                console.error(`${TAG} [Catálogo] Erro ao ler conf BOT_CATALOGO_COM_PRECO`, e);
            }

            const PDFDocument = require('pdfkit');
            const fs = require('fs');
            const path = require('path');
            
            await new Promise((resolve, reject) => {
                const doc = new PDFDocument({ margin: 30, size: 'A4' });
                let buffers = [];
                
                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', async () => {
                    try {
                        const pdfData = Buffer.concat(buffers).toString('base64');
                        console.log(`${TAG} [Catálogo] PDF gerado (${Math.round(pdfData.length / 1024)}KB). Enviando para ${telefone}...`);
                        
                        const uploadCatDir = '/app/SAC/UPLOAD/Catalogo';
                        if (!fs.existsSync(uploadCatDir)) fs.mkdirSync(uploadCatDir, { recursive: true });
                        const fileNameCat = `Catalogo_${nomeRamo.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}.pdf`;
                        fs.writeFileSync(path.join(uploadCatDir, fileNameCat), Buffer.from(pdfData, 'base64'));

                        await this.enviarDocumentoBase64(telefone, pdfData, 'application/pdf', fileNameCat, instanceName, conn);
                        await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
                doc.on('error', reject);

                const margin = 30;
                const pageWidth = 595.28;
                const pageHeight = 841.89;
                const usableWidth = pageWidth - margin * 2;
                const cols = 3;
                const colWidth = usableWidth / cols;
                const colPadding = 15;
                const rowHeight = 200;
                
                const imagesDir = process.env.IMAGES_DIR || path.join(__dirname, '../../imagens_produtos');
                const extensions = ['.jpg', '.jpeg', '.png', '.webp', '.JPG', '.JPEG', '.PNG'];
                
                const drawHeader = () => {
                    doc.rect(0, 0, pageWidth, 80).fill('#dc2626'); // red-600
                    doc.fillColor('white').fontSize(24).font('Helvetica-Bold').text('Catálogo de Ofertas', 0, 20, { align: 'center' });
                    doc.fillColor('#fde047').fontSize(14).font('Helvetica').text(`- ${nomeRamo} -`, 0, 50, { align: 'center' });
                    doc.fillColor('black'); // Reset
                };
                
                drawHeader();
                let currentY = 100;
                let currentCol = 0;

                if (resProd.rows.length === 0) {
                    doc.fillColor('#475569').fontSize(14).font('Helvetica').text("Nenhum produto disponível para este ramo no momento.", margin, currentY);
                } else {
                    resProd.rows.forEach(r => {
                        if (currentCol >= cols) {
                            currentCol = 0;
                            currentY += rowHeight;
                        }
                        
                        if (currentY + rowHeight > pageHeight - margin) {
                            doc.addPage();
                            drawHeader();
                            currentY = 100;
                            currentCol = 0;
                        }
                        
                        const x = margin + (currentCol * colWidth) + (colPadding / 2);
                        const cellW = colWidth - colPadding;
                        const codprod = r[0];
                        const descricao = r[1] || '';
                        const precoVal = catalogoComPreco ? (r[2] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
                        const unidade = r[3] ? r[3].trim() : 'UN';
                        const ean = r[4] ? String(r[4]).trim() : '';
                        
                        let imagePath = null;
                        if (fs.existsSync(imagesDir)) {
                            for (let ext of extensions) {
                                const fp = path.join(imagesDir, `${codprod}${ext}`);
                                if (fs.existsSync(fp)) {
                                    imagePath = fp;
                                    break;
                                }
                            }
                        }
                        
                        // Draw cell background / border
                        doc.rect(x, currentY, cellW, rowHeight - 15).fillAndStroke('#ffffff', '#e2e8f0');
                        
                        if (imagePath) {
                            try {
                                doc.image(imagePath, x + 5, currentY + 5, { fit: [cellW - 10, 100], align: 'center', valign: 'center' });
                            } catch(err) {
                                doc.rect(x + 5, currentY + 5, cellW - 10, 100).fill('#f1f5f9');
                                doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text("Erro Imagem", x, currentY + 50, { width: cellW, align: 'center' });
                            }
                        } else {
                            doc.rect(x + 5, currentY + 5, cellW - 10, 100).fill('#f1f5f9');
                            doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text("Sem Imagem", x, currentY + 50, { width: cellW, align: 'center' });
                        }
                        
                        // Text
                        const subtitle = ean ? `Cód: ${codprod} | EAN: ${ean}` : `Cód: ${codprod}`;
                        doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(subtitle, x + 5, currentY + 115, { width: cellW - 10 });
                        doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(descricao, x + 5, currentY + 128, { width: cellW - 10, height: 25, ellipsis: true });
                        
                        // Price (Left) and Unit (Right)
                        if (catalogoComPreco) {
                            doc.fillColor('#0284c7').fontSize(14).font('Helvetica-Bold').text(precoVal, x + 5, currentY + 160, { width: cellW - 10, align: 'left' });
                            doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(`/ ${unidade}`, x + 5, currentY + 164, { width: cellW - 10, align: 'right' });
                        } else {
                            doc.fillColor('#64748b').fontSize(10).font('Helvetica-Bold').text(`Consulte condições`, x + 5, currentY + 160, { width: cellW - 10, align: 'center' });
                        }
                        
                        // Reset colors
                        doc.fillColor('black');
                        
                        currentCol++;
                    });
                }
                doc.end();
            });
        } catch (e) {
            console.error(`${TAG} [Catálogo] Erro gerando PDF:`, e);
            await this.webhookPoller.enviarMensagemBot(telefone, "Ocorreu um erro ao gerar o PDF.", conn, instanceName);
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
        }
    }

    async processarDevolucao(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage) {
        console.log(`${TAG} [Devolução] ${telefone} | texto="${text}" | temMídia=${!!audioBase64}`);
        if (text && text.toLowerCase() === 'ok') {
            const ticketId = dados.ticketId;
            try {
                if (ticketId) {
                    await conn.execute(`UPDATE CANAL_SAC_TICKETS SET DESCRICAO = 'Solicitação de Troca/Devolução finalizada pelo cliente.', ATUALIZADO_EM = SYSDATE WHERE ID = :id`, { id: ticketId }, { autoCommit: true });
                    await this.webhookPoller.enviarMensagemBot(telefone, `✅ *[Chamado #${ticketId}] registrado com sucesso!*\n\nSeu pedido de devolução/troca foi concluído com os arquivos enviados.\n\nA equipe de SAC entrará em contato por aqui assim que possível. Enquanto isso, você retornou ao Menu Principal.`, conn, instanceName);
                } else {
                    await this.webhookPoller.enviarMensagemBot(telefone, `✅ Operação finalizada com sucesso!\nA equipe de SAC entrará em contato por aqui assim que possível. Enquanto isso, você retornou ao Menu Principal.`, conn, instanceName);
                }
                await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
                await this.enviarMenuPrincipal(telefone, instanceName, conn);
                console.log(`${TAG} [Devolução] Devolução finalizada pelo usuário ${telefone} (Ticket ${ticketId})`);
            } catch (err) {
                console.error(`${TAG} [Devolução] Erro ao finalizar ticket:`, err);
                await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            }
            return;
        }

        const success = await this.baixarMediaFallback(telefone, instanceName, conn, '/app/SAC/UPLOAD/Devolucoes', 'devolucao', audioBase64, originalMessage);
        console.log(`${TAG} [Devolução] Mídia salva: ${success}`);
        if (success) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Arquivo recebido! Você pode enviar mais fotos/áudios. Quando terminar, digite *OK*.", conn, instanceName);
        } else {
            await this.webhookPoller.enviarMensagemBot(telefone, "Se você está enviando imagens ou vídeos, aguarde um momento. Se já terminou o relato, digite *OK*.", conn, instanceName);
        }
    }

    async processarCadastroCNPJ(telefone, text, instanceName, conn, dados) {
        const cnpj = text.replace(/[^0-9]/g, '');
        console.log(`${TAG} [Cadastro CNPJ] ${telefone} informou CNPJ: "${cnpj}" (original: "${text}")`);
        if (!cnpj) {
            await this.webhookPoller.enviarMensagemBot(telefone, "CNPJ inválido. Digite apenas números.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        const resDepto = await conn.execute(`SELECT ID FROM CANAL_SAC_DEPARTAMENTOS WHERE UPPER(NOME) LIKE '%CADASTRO%' FETCH FIRST 1 ROWS ONLY`);
        const idDepto = resDepto.rows.length > 0 ? resDepto.rows[0][0] : null;

        const sql = `
            INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
            VALUES (:tel, NULL, :dep, :descricao, 'ABERTO')
            RETURNING ID INTO :ticketId
        `;
        const resInsert = await conn.execute(sql, { 
            tel: telefone, 
            dep: idDepto,
            descricao: `Solicitação de Cadastro via Bot.\nCNPJ informado: ${cnpj}`,
            ticketId: { type: require('oracledb').NUMBER, dir: require('oracledb').BIND_OUT }
        }, { autoCommit: true });
        const ticketId = resInsert.outBinds.ticketId[0];

        await this.setState(telefone, 'AGUARDANDO_SINTEGRA_CADASTRO', { cnpj: cnpj, ticketId: ticketId }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, `CNPJ ${cnpj} anotado!\nSeu ticket de pré-cadastro foi aberto sob o número *#${ticketId}*.\nAgora, por favor me envie o *PDF do SINTEGRA* ou o Contrato Social da empresa.`, conn, instanceName);
    }

    async processarCadastroSintegra(telefone, text, instanceName, conn, dados, audioBase64, originalMessage) {
        console.log(`${TAG} [Cadastro Sintegra] ${telefone} | texto="${text}" | CNPJ salvo="${dados.cnpj}" | temMídia=${!!audioBase64}`);
        if (text === '0') {
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        const success = await this.baixarMediaFallback(telefone, instanceName, conn, '/app/SAC/UPLOAD/Cadastro', 'sintegra_' + (dados.cnpj || ''), audioBase64, originalMessage);
        console.log(`${TAG} [Cadastro Sintegra] Arquivo recebido: ${success}`);
        
        if (success) {
            const ticketId = dados.ticketId;
            if (ticketId) {
                try {
                    await conn.execute(`
                        INSERT INTO CANAL_SAC_TICKETS_MSGS (TICKET_ID, ENVIADO_POR, MENSAGEM)
                        VALUES (:id, 'CLIENTE', '📄 Documento (Sintegra/Contrato) enviado pelo cliente.')
                    `, { id: ticketId }, { autoCommit: true });
                } catch (e) {
                    console.log(`${TAG} Erro ao inserir msg do sintegra no ticket ${ticketId}`, e);
                }
            }
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, `Documento recebido! Cadastro pré-recebido e encaminhado para nossa equipe aprovar no Ticket #${ticketId || ''}.\nLogo um consultor entrará em contato.\nPara retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.`, conn, instanceName);
        } else {
            await this.webhookPoller.enviarMensagemBot(telefone, "Ainda estou aguardando o envio do arquivo PDF ou Foto do SINTEGRA/Contrato Social. Por favor, anexe o arquivo.\n\nSe a sua solicitação já foi finalizada ou se deseja cancelar, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
        }
    }

    async processarFalarComVendedor(telefone, instanceName, conn, codcli) {
        console.log(`${TAG} [Falar com Vendedor] ${telefone} quer falar com vendedor (CODCLI: ${codcli || 'null'})`);
        let codusur = null;
        
        if (codcli) {
            const res = await conn.execute(`SELECT CODUSUR1 FROM PCCLIENT WHERE CODCLI = :c`, { c: codcli });
            if (res.rows.length > 0) codusur = res.rows[0][0];
        }

        if (!codusur) {
            codusur = await this.webhookPoller.findCodusurPorTelefone(telefone, conn);
        }
        
        console.log(`${TAG} [Falar com Vendedor] CODUSUR encontrado: ${codusur || 'nenhum'}`);
        
        if (!codusur) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não consegui localizar um vendedor fixo para o seu cadastro. Por favor, acesse a opção 7 (Abrir Chamado) para falar com nossa central.", conn, instanceName);
            return;
        }

        const sql = `SELECT NOME, TELEFONE1 FROM PCUSUARI WHERE CODUSUR = :cod`;
        const res = await conn.execute(sql, { cod: codusur });
        if (res.rows.length > 0) {
            const nomeVend = res.rows[0][0];
            let telVend = res.rows[0][1];
            console.log(`${TAG} [Falar com Vendedor] Vendedor: ${nomeVend} | Tel: ${telVend}`);
            
            if (telVend) {
                telVend = telVend.replace(/[^0-9]/g, '');
                const link = `https://wa.me/55${telVend}`;
                await this.webhookPoller.enviarMensagemBot(telefone, `O seu vendedor responsável é *${nomeVend}*.\n\nVocê pode falar diretamente com ele clicando no link abaixo:\n${link}\n\nPara retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.`, conn, instanceName);
            } else {
                console.log(`${TAG} [Falar com Vendedor] Vendedor ${nomeVend} sem telefone cadastrado`);
                await this.webhookPoller.enviarMensagemBot(telefone, `O seu vendedor responsável é *${nomeVend}*, mas não tenho o número de WhatsApp dele cadastrado.`, conn, instanceName);
            }
        } else {
            console.log(`${TAG} [Falar com Vendedor] Nenhum vendedor encontrado para CODUSUR ${codusur}`);
            await this.webhookPoller.enviarMensagemBot(telefone, "Vendedor não encontrado. Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.", conn, instanceName);
        }
    }

    async enviarMenuDepartamentosTicket(telefone, instanceName, conn) {
        console.log(`${TAG} [Ticket] Carregando departamentos para ${telefone}`);
        const sql = `SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS WHERE ATIVO = 'S' AND NOME IS NOT NULL AND TRIM(NOME) IS NOT NULL AND DEPARTAMENTO_PAI_ID IS NULL AND ID != 41 ORDER BY ID`;
        const res = await conn.execute(sql);
        console.log(`${TAG} [Ticket] ${res.rows.length} departamento(s) ativo(s) encontrado(s)`);
        
        if (res.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não há departamentos configurados para chamados no momento. Tente novamente mais tarde.", conn, instanceName);
            return;
        }

        let texto = "Selecione o Departamento para o qual deseja abrir o chamado:\n\n";
        const deptos = [];
        let i = 1;
        for (const row of res.rows) {
            texto += `${i} - ${row[1]}\n`;
            deptos.push(row[0]);
            console.log(`${TAG} [Ticket] Departamento disponível: idx ${i} -> ID ${row[0]} (${row[1]})`);
            i++;
        }
        texto += "\nPara retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.";

        await this.setState(telefone, 'AGUARDANDO_DEPTO_TICKET', { deptosDisponiveis: deptos, tsInicio: Date.now() }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, texto, conn, instanceName);
    }

    async processarTicketDepto(telefone, text, instanceName, conn, dados) {
        const numStr = text.trim();
        const numIndex = parseInt(numStr, 10);
        const ids = dados.deptosDisponiveis || [];
        
        let selectedId = null;
        if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= ids.length) {
            selectedId = ids[numIndex - 1]; // Usuário digitou o índice do menu
        } else if (ids.map(String).includes(numStr)) {
            selectedId = parseInt(numStr, 10); // Usuário digitou o ID bruto (fallback)
        }

        console.log(`${TAG} [Ticket Depto] ${telefone} digitou: "${numStr}" | resolvido para ID: ${selectedId} | disponíveis: ${JSON.stringify(ids)}`);

        if (selectedId === null) {
            console.log(`${TAG} [Ticket Depto] Opção inválida "${text}" de ${telefone}`);
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção inválida. Digite o número correspondente ao departamento.\n\nSe deseja cancelar a abertura do chamado, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        const num = selectedId;

        // Checar se há subdepartamentos
        const sqlSub = `SELECT ID, NOME FROM CANAL_SAC_DEPARTAMENTOS WHERE DEPARTAMENTO_PAI_ID = :pai AND ATIVO = 'S' AND NOME IS NOT NULL AND TRIM(NOME) IS NOT NULL ORDER BY ID`;
        const resSub = await conn.execute(sqlSub, { pai: num });
        console.log(`${TAG} [Ticket Depto] Sub-departamentos de ${num}: ${resSub.rows.length}`);

        if (resSub.rows.length > 0) {
            let texto = "Selecione o Sub-departamento:\n\n";
            const subDeptos = [];
            let i = 1;
            for (const row of resSub.rows) {
                texto += `${i} - ${row[1]}\n`;
                subDeptos.push(row[0]);
                console.log(`${TAG} [Ticket Depto] Sub-depto: idx ${i} -> ID ${row[0]} (${row[1]})`);
                i++;
            }
            texto += "\nPara retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.";

            await this.setState(telefone, 'AGUARDANDO_SUBDEPTO_TICKET', { deptosDisponiveis: subDeptos, tsInicio: dados.tsInicio }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, texto, conn, instanceName);
        } else {
            // Cria ticket antecipado
            let codcli = null;
            const resCli = await conn.execute(`SELECT CODCLI FROM PCCLIENT WHERE TELCELENT = :t OR TELENT = :t OR TELCOM = :t OR TELCOB = :t FETCH FIRST 1 ROWS ONLY`, { t: telefone });
            if (resCli.rows.length > 0) codcli = resCli.rows[0][0];

            const sql = `
                INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
                VALUES (:tel, :cli, :dep, 'Aguardando relato do cliente...', 'ABERTO')
                RETURNING ID INTO :ticketId
            `;
            const resInsert = await conn.execute(sql, { tel: telefone, cli: codcli, dep: num, ticketId: { type: require('oracledb').NUMBER, dir: require('oracledb').BIND_OUT } }, { autoCommit: true });
            const ticketId = resInsert.outBinds.ticketId[0];

            await this.setState(telefone, 'AGUARDANDO_RELATO_TICKET', { idDepto: num, tsInicio: dados.tsInicio, ticketId: ticketId }, conn);
            await this.webhookPoller.enviarMensagemBot(telefone, `Chamado *#${ticketId}* iniciado.\n\nCerto. Agora digite de forma detalhada a sua dúvida ou solicitação:`, conn, instanceName);
        }
    }

    async processarTicketSubDepto(telefone, text, instanceName, conn, dados) {
        const numStr = text.trim();
        const numIndex = parseInt(numStr, 10);
        const ids = dados.deptosDisponiveis || [];
        
        let selectedId = null;
        if (!isNaN(numIndex) && numIndex >= 1 && numIndex <= ids.length) {
            selectedId = ids[numIndex - 1]; // Usuário digitou o índice do menu
        } else if (ids.map(String).includes(numStr)) {
            selectedId = parseInt(numStr, 10); // Usuário digitou o ID bruto (fallback)
        }

        console.log(`${TAG} [Ticket SubDepto] ${telefone} digitou: "${numStr}" | resolvido para ID: ${selectedId} | disponíveis: ${JSON.stringify(ids)}`);

        if (selectedId === null) {
            console.log(`${TAG} [Ticket SubDepto] Opção inválida "${text}" de ${telefone}`);
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção inválida. Digite o número correspondente ao sub-departamento.\n\nSe deseja cancelar a abertura do chamado, digite *VOLTAR* para o menu ou *0* para encerrar o atendimento.", conn, instanceName);
            return;
        }

        const num = selectedId;

        // Cria ticket antecipado
        let codcli = null;
        const resCli = await conn.execute(`SELECT CODCLI FROM PCCLIENT WHERE TELCELENT = :t OR TELENT = :t OR TELCOM = :t OR TELCOB = :t FETCH FIRST 1 ROWS ONLY`, { t: telefone });
        if (resCli.rows.length > 0) codcli = resCli.rows[0][0];

        const sql = `
            INSERT INTO CANAL_SAC_TICKETS (TELEFONE, CODCLI, DEPARTAMENTO_ID, DESCRICAO, STATUS)
            VALUES (:tel, :cli, :dep, 'Aguardando relato do cliente...', 'ABERTO')
            RETURNING ID INTO :ticketId
        `;
        const resInsert = await conn.execute(sql, { tel: telefone, cli: codcli, dep: num, ticketId: { type: require('oracledb').NUMBER, dir: require('oracledb').BIND_OUT } }, { autoCommit: true });
        const ticketId = resInsert.outBinds.ticketId[0];

        await this.setState(telefone, 'AGUARDANDO_RELATO_TICKET', { idDepto: num, tsInicio: dados.tsInicio, ticketId: ticketId }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, `Chamado *#${ticketId}* iniciado.\n\nCerto. Agora digite de forma detalhada a sua dúvida ou solicitação:`, conn, instanceName);
    }

    async processarTicketRelato(telefone, text, instanceName, conn, dados) {
        const ticketId = dados.ticketId;
        
        if (ticketId) {
            await conn.execute(`
                UPDATE CANAL_SAC_TICKETS SET DESCRICAO = :descricao, ATUALIZADO_EM = SYSDATE WHERE ID = :id
            `, { descricao: text, id: ticketId }, { autoCommit: true });
        }

        // Busca nome do departamento e subdepartamento
        const deptoRes = await conn.execute(`
            SELECT d.NOME, p.NOME
            FROM CANAL_SAC_DEPARTAMENTOS d
            LEFT JOIN CANAL_SAC_DEPARTAMENTOS p ON d.DEPARTAMENTO_PAI_ID = p.ID
            WHERE d.ID = :id
        `, { id: dados.idDepto });

        let nomeCompletoDepto = '';
        if (deptoRes.rows.length > 0) {
            const deptoNome = deptoRes.rows[0][0];
            const paiNome = deptoRes.rows[0][1];
            if (paiNome && deptoNome) {
                nomeCompletoDepto = `${paiNome} / ${deptoNome}`;
            } else if (deptoNome) {
                nomeCompletoDepto = deptoNome;
            }
        }
        
        const tituloTicket = ticketId ? (nomeCompletoDepto ? `[Chamado #${ticketId} - ${nomeCompletoDepto}]` : `[Chamado #${ticketId}]`) : (nomeCompletoDepto ? `[Chamado - ${nomeCompletoDepto}]` : `[Chamado]`);

        const msg = `✅ *${tituloTicket} aberto com sucesso!*\n\nNossa equipe já recebeu seu relato e entrará em contato por aqui assim que possível.\n\nEnquanto isso, você retornou ao Menu Principal.`;
        await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
        await this.enviarMenuPrincipal(telefone, instanceName, conn);
    }

    async processarAvaliacao(telefone, text, instanceName, conn, dados) {
        if (!text) return;

        const cmd = text.trim().toLowerCase();
        if (cmd === 'pular') {
            await this.webhookPoller.enviarMensagemBot(telefone, `Você pulou a avaliação. Agradecemos o contato!`, conn, instanceName);
            await this.setState(telefone, null, null, conn);
            return;
        }

        const ticketId = dados.ticketId;
        const num = parseInt(text.trim());
        
        if (isNaN(num) || num < 1 || num > 10) {
            const msg = `⚠️ Nota selecionada é inválida. Por favor, responda apenas com um número de *1 a 10* (sendo 1 muito ruim e 10 excelente).\n\nDigite *PULAR* para cancelar a avaliação.`;
            await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
            return;
        }

        // Salvar nota
        try {
            await conn.execute(`
                UPDATE CANAL_SAC_TICKETS 
                SET STATUS = 'FINALIZADO', NOTA_AVALIACAO = :nota, ATUALIZADO_EM = SYSDATE 
                WHERE ID = :id
            `, { nota: num, id: ticketId }, { autoCommit: true });
            
            const msgFinal = `Obrigado pela sua avaliação (Nota: ${num})! Agradecemos o seu contato.`;
            await this.webhookPoller.enviarMensagemBot(telefone, msgFinal, conn, instanceName);
            
            // Limpa o estado (finaliza o bot para este contato)
            await this.setState(telefone, null, null, conn);
        } catch (e) {
            console.error('[SAC] Erro ao salvar avaliação:', e);
            await this.webhookPoller.enviarMensagemBot(telefone, `Ocorreu um erro ao registrar sua avaliação.`, conn, instanceName);
            await this.setState(telefone, null, null, conn);
        }
    }

    async identificarContato(telefone, conn) {
        let result = { type: 'desconhecido', isVendedor: false, isCliente: false };

        const sqlVendor = `
            SELECT CODUSUR, NOME FROM PCUSUARI 
            WHERE REPLACE(REPLACE(REPLACE(REPLACE(TELEFONE1, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
        `;
        const resVendor = await conn.execute(sqlVendor, { tel: telefone });
        if (resVendor.rows.length > 0) {
            result.type = 'vendedor';
            result.isVendedor = true;
            result.codusur = resVendor.rows[0][0];
            result.nomeVendedor = resVendor.rows[0][1];
        }

        let codcliAutenticado = null;
        try {
            const sqlState = `SELECT DADOS_TEMPORARIOS FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`;
            const resState = await conn.execute(sqlState, { tel: telefone });
            if (resState.rows.length > 0 && resState.rows[0][0]) {
                let jsonStr = resState.rows[0][0];
                if (typeof jsonStr === 'object' && typeof jsonStr.getData === 'function') {
                    jsonStr = await jsonStr.getData();
                }
                const dados = JSON.parse(jsonStr);
                if (dados.codcliAutenticado) {
                    codcliAutenticado = dados.codcliAutenticado;
                }
            }
        } catch(e) {
            console.error(`${TAG} [identificarContato] Erro ao ler DADOS_TEMPORARIOS:`, e);
        }

        if (codcliAutenticado) {
            const sqlCli = `SELECT CODCLI, CLIENTE, REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') AS CNPJ FROM PCCLIENT WHERE CODCLI = :cod`;
            const resCli = await conn.execute(sqlCli, { cod: codcliAutenticado });
            if (resCli.rows.length > 0) {
                result.type = 'cliente';
                result.isCliente = true;
                result.codcli = resCli.rows[0][0];
                result.nome = resCli.rows[0][1];
                result.cnpj = resCli.rows[0][2];
                return result;
            }
        }

        const sqlClient = `
            SELECT CODCLI, CLIENTE, REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') AS CNPJ FROM (
                SELECT CODCLI, CLIENTE, CGCENT FROM PCCLIENT 
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(TELENT, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
                   OR REPLACE(REPLACE(REPLACE(REPLACE(TELCELENT, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
                   OR REPLACE(REPLACE(REPLACE(REPLACE(TELCOM, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
                   OR REPLACE(REPLACE(REPLACE(REPLACE(TELCOB, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
                UNION
                SELECT CO.CODCLI, C.CLIENTE, C.CGCENT FROM PCCONTATO CO
                JOIN PCCLIENT C ON C.CODCLI = CO.CODCLI
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(CO.TELEFONE, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
                   OR REPLACE(REPLACE(REPLACE(REPLACE(CO.CELULAR, ' ', ''), '-', ''), '(', ''), ')', '') = :tel
            )
            FETCH FIRST 1 ROWS ONLY
        `;
        const resClient = await conn.execute(sqlClient, { tel: telefone });
        if (resClient.rows.length > 0) {
            result.type = 'cliente'; // Para forçar cair no isCliente do Menu Principal
            result.isCliente = true;
            result.codcli = resClient.rows[0][0];
            result.nome = resClient.rows[0][1];
            result.cnpj = resClient.rows[0][2];
        }

        return result;
    }

    async enviarDocumentoBase64(telefone, base64Data, mimeType, fileName, instanceName, conn) {
        console.log(`${TAG} [enviarDoc] Enviando "${fileName}" (${mimeType}) para ${telefone}`);
        try {
            const axios = require('axios');
            const resultTokens = await conn.execute(`
                SELECT API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) AS URL_BASE 
                FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst
            `, [instanceName]);

            if (resultTokens.rows.length > 0) {
                const apiToken = resultTokens.rows[0][0];
                const urlBase = resultTokens.rows[0][1];
                
                const cacheService = require('./cacheService');
                let p = telefone.startsWith('55') ? telefone : '55' + telefone;
                p = cacheService.getDestinoFinal(p);

                // Evolution Padrão
                const urlEvo = `${urlBase}/message/sendMedia/${instanceName}`;
                const payloadEvo = {
                    number: p,
                    mediatype: mimeType.includes('image') ? 'image' : 'document',
                    mimetype: mimeType,
                    media: base64Data,
                    fileName: fileName
                };
                
                // Evo Go
                const urlEvoGo = `${urlBase}/send/media`;
                const typeGo = mimeType.includes('image') ? 'image' : 'document';
                
                // Se o base64Data já vier com o prefixo, precisamos limpar antes de mandar para o Evo GO
                let cleanBase64 = base64Data;
                if (cleanBase64.includes('base64,')) {
                    cleanBase64 = cleanBase64.split('base64,')[1];
                }
                
                const payloadEvoGo = {
                    number: p,
                    type: typeGo,
                    url: cleanBase64,
                    filename: fileName
                };
                
                try {
                    await axios.post(urlEvo, payloadEvo, { headers: { 'Content-Type': 'application/json', 'apikey': apiToken }});
                    console.log(`${TAG} [enviarDoc] ✅ Enviado via Evolution padrão`);
                } catch(e) {
                    if (e.response && (e.response.status === 404 || e.response.status === 400)) {
                        await axios.post(urlEvoGo, payloadEvoGo, { headers: { 'Content-Type': 'application/json', 'apikey': apiToken, 'instance': instanceName }});
                        console.log(`${TAG} [enviarDoc] ✅ Enviado via Evolution Go (fallback)`);
                    } else {
                        throw e;
                    }
                }
            } else {
                console.warn(`${TAG} [enviarDoc] Token não encontrado para instância "${instanceName}"`);
            }
        } catch(e) {
            console.error(`${TAG} [enviarDoc] ❌ Erro ao enviar mídia:`, e.message);
        }
    }

    async baixarMediaFallback(telefone, instanceName, conn, dirDestino, prefixo, webhookBase64, originalMessage = null) {
        try {
            const fs = require('fs');
            const path = require('path');
            const axios = require('axios');

            // 1. Se já recebemos o base64 direto no payload do webhook, salvamos direto!
            if (webhookBase64) {
                if (!fs.existsSync(dirDestino)) fs.mkdirSync(dirDestino, { recursive: true });
                let cleanBase64 = webhookBase64;
                if (cleanBase64.includes('base64,')) cleanBase64 = cleanBase64.split('base64,')[1];
                const filePath = path.join(dirDestino, `${prefixo}_${telefone}_${Date.now()}.pdf`);
                fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
                console.log(`${TAG} [baixarMedia] ✅ Mídia salva via base64 do webhook: ${filePath}`);
                return true;
            }

            console.log(`${TAG} [baixarMedia] Sem base64 direto. Tentando baixar via API para ${telefone}...`);
            
            const resultTokens = await conn.execute(`SELECT API_TOKEN, COALESCE(API_URL, (SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'EVOLUTION_API_URL')) FROM CANAL_TOKENS_EVOLUTION WHERE INSTANCE_NAME = :inst`, [instanceName]);
            if (resultTokens.rows.length === 0) {
                console.warn(`${TAG} [baixarMedia] Token não encontrado para instância "${instanceName}"`);
                return false;
            }
            
            const tokenEvo = resultTokens.rows[0][0];
            const urlBaseEvo = resultTokens.rows[0][1];

            let finalBase64 = null;
            let ext = 'pdf'; // Default

            // 2. Tentar baixar usando Evolution GO (/message/downloadmedia)
            if (originalMessage && originalMessage.Message && (originalMessage.Message.documentMessage || originalMessage.Message.imageMessage || originalMessage.Message.audioMessage || originalMessage.Message.videoMessage)) {
                try {
                    console.log(`${TAG} [baixarMedia] Usando Evolution GO /message/downloadmedia...`);
                    const goResponse = await axios.post(
                        `${urlBaseEvo}/message/downloadmedia`,
                        { message: originalMessage.Message },
                        { headers: { 'apikey': tokenEvo, 'instance': instanceName, 'Content-Type': 'application/json' } }
                    );
                    if (goResponse.data) {
                        finalBase64 = goResponse.data.base64 || (goResponse.data.data && goResponse.data.data.base64);
                        if (finalBase64) {
                            console.log(`${TAG} [baixarMedia] ✅ Baixado com sucesso via Evolution GO.`);
                            if (originalMessage.Message.imageMessage) ext = 'jpg';
                            else if (originalMessage.Message.videoMessage) ext = 'mp4';
                            else if (originalMessage.Message.audioMessage) ext = 'ogg';
                            else if (originalMessage.Message.documentMessage && originalMessage.Message.documentMessage.mimetype) {
                                if (originalMessage.Message.documentMessage.mimetype.includes('pdf')) ext = 'pdf';
                                else if (originalMessage.Message.documentMessage.mimetype.includes('image')) ext = 'jpg';
                            }
                        }
                    }
                } catch(goErr) {
                    console.warn(`${TAG} [baixarMedia] Falha no Evo GO: ${goErr.response?.data?.error || goErr.message}`);
                }
            }

            // 3. Se Evo GO falhou ou não havia originalMessage, tentar Fallback para Evolution API Padrão
            if (!finalBase64) {
                const res = await conn.execute(`SELECT ID_MENSAGEM FROM CANAL_MENSAGENS WHERE TELEFONE_CLIENTE = :tel ORDER BY DATA_HORA DESC FETCH FIRST 1 ROWS ONLY`, { tel: telefone });
                if (res.rows.length === 0) {
                    console.warn(`${TAG} [baixarMedia] Nenhuma mensagem recente em CANAL_MENSAGENS para ${telefone}`);
                    return false;
                }
                const msgId = res.rows[0][0];

                try {
                    console.log(`${TAG} [baixarMedia] Usando Evolution API Padrão para msg id: ${msgId}...`);
                    const response = await axios.post(
                        `${urlBaseEvo}/chat/getBase64FromMediaMessage/${instanceName}`,
                        { message: { key: { id: msgId } } },
                        { headers: { 'apikey': tokenEvo, 'Content-Type': 'application/json' } }
                    );
                    finalBase64 = response.data.base64 || null;
                    if (finalBase64) {
                        console.log(`${TAG} [baixarMedia] ✅ Baixado com sucesso via API Padrão.`);
                        if (response.data.mimetype) {
                            if (response.data.mimetype.includes('image/jpeg')) ext = 'jpg';
                            else if (response.data.mimetype.includes('image/png')) ext = 'png';
                            else if (response.data.mimetype.includes('video/mp4')) ext = 'mp4';
                        }
                    }
                } catch (apiErr) {
                    console.error(`${TAG} [baixarMedia] Falha na API Padrão: ${apiErr.response?.data?.error || apiErr.message}`);
                }
            }

            // 4. Salvar base64 em arquivo
            if (finalBase64) {
                if (!fs.existsSync(dirDestino)) fs.mkdirSync(dirDestino, { recursive: true });
                let cleanBase64 = finalBase64;
                if (cleanBase64.includes('base64,')) cleanBase64 = cleanBase64.split('base64,')[1];
                const filePath = path.join(dirDestino, `${prefixo}_${telefone}_${Date.now()}.${ext}`);
                fs.writeFileSync(filePath, Buffer.from(cleanBase64, 'base64'));
                console.log(`${TAG} [baixarMedia] ✅ Mídia salva: ${filePath}`);
                return true;
            } else {
                console.warn(`${TAG} [baixarMedia] ❌ Não foi possível obter o Base64 por nenhum dos métodos.`);
                return false;
            }
        } catch (e) {
            console.error(`${TAG} [baixarMedia] ❌ Erro não tratado:`, e.message);
            return false;
        }
    }

    async processarFornecedor(telefone, instanceName, conn) {
        let msg = "🏢 *Contatos para Fornecedores:*\n\n";
        
        const sql = `SELECT CHAVE, VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE IN ('CONTATO_FINANCEIRO', 'CONTATO_COMPRAS')`;
        const res = await conn.execute(sql);
        const configs = {};
        res.rows.forEach(r => configs[r[0]] = r[1]);

        if (configs['CONTATO_FINANCEIRO']) {
            msg += `💰 *Financeiro:* ${configs['CONTATO_FINANCEIRO']}\n`;
        } else {
            msg += `💰 *Financeiro:* (Não configurado)\n`;
        }

        if (configs['CONTATO_COMPRAS']) {
            msg += `🛒 *Compras:* ${configs['CONTATO_COMPRAS']}\n`;
        } else {
            msg += `🛒 *Compras:* (Não configurado)\n`;
        }

        msg += "\nPara retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.";
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
        await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
    }

    async processarCNPJTickets(telefone, text, instanceName, conn, dados) {
        const busca = (text || '').replace(/[^0-9]/g, '');
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Não identifiquei números. Digite seu CNPJ ou 1 para buscar pelo telefone.\nPara retornar ao menu anterior, use VOLTAR ou 0 para encerrar.", conn, instanceName);
            return;
        }

        let cnpj = null;
        if (busca === '1') {
            const contato = await this.identificarContato(telefone, conn);
            if (contato.cnpj) {
                cnpj = contato.cnpj;
            }
        } else {
            cnpj = busca;
        }

        await this.processarListarTickets(telefone, cnpj, instanceName, conn, dados);
    }

    async processarListarTickets(telefone, cnpjBusca, instanceName, conn, dados) {
        let sql = `
            SELECT ID, STATUS, DBMS_LOB.SUBSTR(DESCRICAO, 100, 1), DEPARTAMENTO_ID, CRIADO_EM
            FROM CANAL_SAC_TICKETS
            WHERE TELEFONE = :telefone
            AND UPPER(STATUS) NOT IN ('FINALIZADO', 'FECHADO', 'FINALIZADOS', 'FECHADOS')
        `;
        let params = { telefone };

        if (cnpjBusca && cnpjBusca !== '1') {
            const resCli = await conn.execute(`SELECT CODCLI FROM PCCLIENT WHERE REPLACE(REPLACE(REPLACE(CGCENT, '.', ''), '/', ''), '-', '') = :cnpj FETCH FIRST 1 ROWS ONLY`, { cnpj: cnpjBusca });
            if (resCli.rows.length > 0) {
                sql = `
                    SELECT ID, STATUS, DBMS_LOB.SUBSTR(DESCRICAO, 100, 1), DEPARTAMENTO_ID, CRIADO_EM
                    FROM CANAL_SAC_TICKETS
                    WHERE (CODCLI = :codcli OR TELEFONE = :telefone)
                    AND UPPER(STATUS) NOT IN ('FINALIZADO', 'FECHADO', 'FINALIZADOS', 'FECHADOS')
                `;
                params = { codcli: resCli.rows[0][0], telefone };
            }
        }

        sql += ` ORDER BY ID DESC FETCH FIRST 5 ROWS ONLY`;
        const result = await conn.execute(sql, params);

        if (result.rows.length === 0) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Nenhum ticket encontrado para este contato.\n\nPara retornar ao menu, use VOLTAR.", conn, instanceName);
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            return;
        }

        let msg = "📋 *Seus últimos tickets:*\n\n";
        let validIds = [];
        for (const row of result.rows) {
            const id = row[0];
            const status = row[1];
            const desc = (row[2] || '').substring(0, 30).replace(/\n/g, ' ') + '...';
            msg += `*#${id}* - Status: ${status}\nDescrição: ${desc}\n\n`;
            validIds.push(id.toString());
        }

        msg += "Digite o *número do ticket* (ex: 123) para ver a última resposta e/ou responder a ele.\n\nPara voltar, digite VOLTAR ou 0 para encerrar.";
        
        await this.setState(telefone, 'AGUARDANDO_SELECAO_TICKET_LEITURA', { validIds }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
    }

    async processarSelecaoTicketLeitura(telefone, text, instanceName, conn, dados) {
        const idTicket = (text || '').replace(/[^0-9]/g, '');
        if (!idTicket || !dados.validIds?.includes(idTicket)) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Ticket inválido. Digite apenas o número de um dos tickets listados acima ou VOLTAR.", conn, instanceName);
            return;
        }

        const sql = `
            SELECT TEXTO, DATA_HORA, SENTIDO
            FROM CANAL_MENSAGENS
            WHERE TICKET_ID = :idTicket
            ORDER BY DATA_HORA DESC
            FETCH FIRST 1 ROWS ONLY
        `;
        const result = await conn.execute(sql, { idTicket });

        let msg = `🔍 *Ticket #${idTicket}*\n\n`;
        if (result.rows.length > 0) {
            const txt = result.rows[0][0];
            const sentido = result.rows[0][2];
            const quem = sentido === 'I' ? 'Você' : 'Atendente/SAC';
            msg += `*Última interação (${quem}):*\n${txt}\n\n`;
        } else {
            msg += `_Nenhuma interação registrada ainda._\n\n`;
        }

        msg += `Deseja adicionar mais informações ao ticket?\n\nDigite a sua resposta abaixo para enviarmos à equipe do SAC. Se quiser enviar um anexo/foto, envie junto com a mensagem de texto.\n\nPara voltar, digite VOLTAR.`;

        await this.setState(telefone, 'AGUARDANDO_MENSAGEM_RESPOSTA_TICKET', { ticketId: idTicket }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
    }

    async processarMensagemRespostaTicket(telefone, text, isAudio, audioBase64, instanceName, conn, dados, originalMessage) {
        const ticketId = dados.ticketId;
        
        if (text === '0' || text?.toUpperCase() === 'VOLTAR') {
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        if (ticketId) {
            try {
                await conn.execute(`
                    UPDATE CANAL_SAC_TICKETS SET STATUS = CASE WHEN STATUS = 'EM ATENDIMENTO' THEN 'EM ATENDIMENTO' ELSE 'ABERTO' END, ATUALIZADO_EM = SYSDATE WHERE ID = :id
                `, { id: ticketId }, { autoCommit: true });
            } catch (e) {
                console.log(`${TAG} Erro ao atualizar ticket:`, e);
            }
            
            await this.webhookPoller.enviarMensagemBot(telefone, `✅ Mensagem enviada para a equipe responsável no Ticket #${ticketId}.\nVocê pode enviar mais mensagens/fotos para este ticket, ou digitar *VOLTAR* para o Menu Principal.`, conn, instanceName);
        } else {
            await this.setState(telefone, 'MENU_PRINCIPAL', {}, conn);
            await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }
    }
}

module.exports = SacBotService;
