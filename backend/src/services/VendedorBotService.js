const oracledb = require('oracledb');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const botMsgs = require('./botMensagensService');

const TAG = '[VENDEDOR-BOT]';

class VendedorBotService {
    constructor(webhookPoller) {
        this.webhookPoller = webhookPoller;
    }

    async getHierarchySellers(codusur, conn) {
        try {
            const queryCargo = `
                SELECT 
                    CASE 
                        WHEN G.CODGERENTE IS NOT NULL THEN 'GERENTE'
                        WHEN S.CODSUPERVISOR IS NOT NULL THEN 'SUPERVISOR'
                        ELSE 'VENDEDOR'
                    END AS CARGO
                FROM PCUSUARI U
                LEFT JOIN PCSUPERV S ON U.CODUSUR = S.COD_CADRCA
                LEFT JOIN PCGERENTE G ON U.CODUSUR = G.COD_CADRCA
                WHERE U.CODUSUR = :cod
            `;
            const resCargo = await conn.execute(queryCargo, { cod: codusur });
            let cargo = 'VENDEDOR';
            if (resCargo.rows.length > 0) cargo = resCargo.rows[0][0];

            if (cargo === 'GERENTE') {
                const qGerente = `
                    SELECT U.CODUSUR 
                    FROM PCUSUARI U 
                    JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR 
                    WHERE S.CODGERENTE = (SELECT CODGERENTE FROM PCGERENTE WHERE COD_CADRCA = :cod)
                `;
                const res = await conn.execute(qGerente, { cod: codusur });
                return res.rows.map(r => r[0]);
            } else if (cargo === 'SUPERVISOR') {
                const qSuperv = `
                    SELECT U.CODUSUR 
                    FROM PCUSUARI U 
                    JOIN PCSUPERV S ON U.CODSUPERVISOR = S.CODSUPERVISOR 
                    WHERE S.COD_CADRCA = :cod
                `;
                const res = await conn.execute(qSuperv, { cod: codusur });
                return res.rows.map(r => r[0]);
            } else {
                return [parseInt(codusur, 10)];
            }
        } catch (e) {
            console.error(`${TAG} Erro ao buscar hierarquia de vendedores para ${codusur}`, e);
            return [parseInt(codusur, 10)]; // Fallback
        }
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

        const saudacoes = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'e aí', 'menu', 'voltar', 'cancelar', 'sair', 'inicio', 'iniciar', 'começar'];
        if (saudacoes.includes(cmd)) {
            await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        try {
            switch (estado) {
                case 'VENDEDOR_MENU_PRINCIPAL':
                    return await this.processarMenuPrincipal(telefone, text, instanceName, conn, codvendedor);
                
                case 'VENDEDOR_ASSISTENTE_COMUNICACAO_BUSCA_CLIENTE':
                    return await this.processarAssistenteComunicacaoBuscaCliente(telefone, text, instanceName, conn, dados, codvendedor);
                
                case 'VENDEDOR_MEUS_OBJETIVOS':
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

                case 'VENDEDOR_CATALOGO_BUSCA':
                    return await this.processarCatalogoBusca(telefone, text, instanceName, conn, dados, codvendedor);

                default:
                    await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
                    return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }
        } catch (error) {
            console.error(`${TAG} Erro no fluxo (estado="${estado}"):`, error);
            await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_ERRO_GENERICO'), conn, instanceName);
        }
    }

    async enviarMenuPrincipal(telefone, instanceName, conn) {
        let nomeEmpresa = '';
        try {
            const resCfg = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'NOME_EMPRESA'`);
            if (resCfg.rows.length > 0 && resCfg.rows[0][0]) {
                nomeEmpresa = resCfg.rows[0][0];
            }
        } catch(e) {}

        let menuTextRaw = botMsgs.getMsg('VEND_MENU_PRINCIPAL')
            .replace(/\{\{nome_empresa\}\}/g, nomeEmpresa);

        // Se o template personalizado no banco ainda não contiver a opção 6 de Catálogo, insere antes do 0
        if (!menuTextRaw.includes('Catálogo') && !menuTextRaw.includes('Catalogo') && !menuTextRaw.includes('catálogo') && !menuTextRaw.includes('catalogo')) {
            const linhas = menuTextRaw.split('\n');
            const idxZero = linhas.findIndex(l => /^\s*0/i.test(l));
            if (idxZero !== -1) {
                linhas.splice(idxZero, 0, '6️⃣ - 📦 Catálogo');
                menuTextRaw = linhas.join('\n');
            } else {
                menuTextRaw += '\n6️⃣ - 📦 Catálogo';
            }
        }
            
        let menuAtivos = '1,2,3,4,5,6,0';
        try {
            const resCfg = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'VEND_MENU_ATIVOS'`);
            if (resCfg.rows.length > 0 && resCfg.rows[0][0]) {
                menuAtivos = resCfg.rows[0][0];
                if (!menuAtivos.split(',').map(s => s.trim()).includes('6')) {
                    menuAtivos += ',6';
                }
            }
        } catch(e) {}
        const ativosArray = menuAtivos.split(',').map(s => s.trim());

        const menuText = menuTextRaw.split('\n').filter(linha => {
            const match = linha.match(/^\s*(\d)/);
            if (match) {
                return ativosArray.includes(match[1]);
            }
            return true;
        }).join('\n');

        await this.webhookPoller.enviarMensagemBot(telefone, menuText, conn, instanceName);
    }

    async processarMenuPrincipal(telefone, text, instanceName, conn, codvendedor) {
        const opcao = (text || '').trim();
        const saudacoes = ['oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'opa', 'e ai', 'e aí', 'menu', 'voltar', 'cancelar', 'sair', 'inicio', 'iniciar', 'começar'];
        
        if (saudacoes.includes(opcao.toLowerCase())) {
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        // Verifica configurações de opções ativas
        let menuAtivos = '1,2,3,4,5,6,0';
        try {
            const resCfg = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'VEND_MENU_ATIVOS'`);
            if (resCfg.rows.length > 0 && resCfg.rows[0][0]) {
                menuAtivos = resCfg.rows[0][0];
                if (!menuAtivos.split(',').map(s => s.trim()).includes('6')) {
                    menuAtivos += ',6';
                }
            }
        } catch(e) {}
        const ativosArray = menuAtivos.split(',').map(s => s.trim());

        if (opcao !== '' && !ativosArray.includes(opcao) && !['catalogo', 'catálogo'].includes(opcao.toLowerCase())) {
            await this.webhookPoller.enviarMensagemBot(telefone, "Opção indisponível no momento. Por favor, escolha outra opção.", conn, instanceName);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        switch (opcao.toLowerCase()) {
            case '1':
                await this.setState(telefone, 'VENDEDOR_ASSISTENTE_COMUNICACAO_BUSCA_CLIENTE', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_ASSIST_BUSCA_CLIENTE'), conn, instanceName);
                break;
            case '2':
                await this.setState(telefone, 'VENDEDOR_MEUS_OBJETIVOS', {}, conn);
                await this.processarMinhasMetas(telefone, '', instanceName, conn, {}, codvendedor);
                break;
            case '3':
                await this.setState(telefone, 'VENDEDOR_TICKETS_STATUS', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_TICKET_STATUS_MENU'), conn, instanceName);
                break;
            case '4':
                await this.setState(telefone, 'VENDEDOR_ABRIR_TICKET_BUSCA_CLIENTE', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_TICKET_ABRIR_BUSCA'), conn, instanceName);
                break;
            case '5':
                await this.setState(telefone, 'VENDEDOR_CONSULTAR_CNPJ', {}, conn);
                await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_CNPJ_CONSULTA'), conn, instanceName);
                break;
            case '6':
            case 'catalogo':
            case 'catálogo':
                await this.iniciarFluxoCatalogo(telefone, instanceName, conn, codvendedor);
                break;
            case '0':
                await conn.execute(`DELETE FROM CANAL_BOT_STATE WHERE TELEFONE = :tel`, [telefone]);
                await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_ENCERRAR_ATENDIMENTO'), conn, instanceName);
                break;
            default:
                await this.enviarMenuPrincipal(telefone, instanceName, conn);
                break;
        }
    }

    async processarAssistenteComunicacaoBuscaCliente(telefone, text, instanceName, conn, dados, codvendedor) {
        const busca = (text || '').replace(/[^0-9]/g, '');
        if (!busca) {
            await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_CODCLI_INVALIDO'), conn, instanceName);
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
        const hierarchySellers = await this.getHierarchySellers(codvendedor, conn);
        
        if (!hierarchySellers.includes(parseInt(codusur1, 10))) {
            await this.webhookPoller.enviarMensagemBot(telefone, "⚠️ *Atenção:* Este cliente não pertence à sua carteira (ou à de sua equipe).\n\nPor favor, informe outro CODCLI ou CNPJ, ou digite VOLTAR para cancelar.", conn, instanceName);
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
        // Se o vendedor digitar VOLTAR, retorna ao menu
        if ((text || '').trim().toUpperCase() === 'VOLTAR') {
            await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        const hierarchySellers = await this.getHierarchySellers(codvendedor, conn);

        if (hierarchySellers.length > 1) {
            await this.webhookPoller.enviarMensagemBot(telefone, `📊 Identificamos que você possui uma equipe de ${hierarchySellers.length} vendedor(es).\nGerando painel de objetivos individualmente...`, conn, instanceName);
        }

        for (const codAlvo of hierarchySellers) {
            await this.gerarEEnviarMetas(telefone, instanceName, conn, codAlvo);
            
            if (hierarchySellers.length > 1) {
                await new Promise(r => setTimeout(r, 2500)); // Pequena pausa para evitar bloqueio no envio
            }
        }

        await this.webhookPoller.enviarMensagemBot(telefone, 'Digite VOLTAR para retornar ao menu.', conn, instanceName);
    }

    async gerarEEnviarMetas(telefone, instanceName, conn, codvendedorAlvo) {
        try {
            const sql = `
                WITH CLIENTES_PERDIDOS AS (
                    SELECT C.CODCLI
                    FROM PCCLIENT C
                    WHERE C.CODUSUR1 = :codvendedor
                      AND C.DTULTCOMP >= TRUNC(SYSDATE) - 90
                      AND C.DTULTCOMP < TRUNC(SYSDATE, 'MM')
                ),
                PESO_POTENCIAL AS (
                    SELECT 
                        CODEPTO, 
                        ROUND(SUM(AVG_PESO_PRODUTO), 2) AS PESO_POTENCIAL
                    FROM (
                        SELECT
                            A.CODEPTO,
                            SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / COUNT(A.CODPROD) AS AVG_PESO_PRODUTO
                        FROM PCMOV A
                        JOIN CLIENTES_PERDIDOS P ON P.CODCLI = A.CODCLI
                        JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                        WHERE A.CODUSUR = :codvendedor
                          AND A.CODOPER LIKE 'S%'
                          AND A.DTMOV < TRUNC(SYSDATE, 'MM')
                          AND EXISTS (
                              SELECT 1 FROM PCEST E
                              WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0
                          )
                        GROUP BY A.CODCLI, A.CODEPTO, A.CODPROD
                        HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
                    )
                    GROUP BY CODEPTO
                )
                SELECT
                    TO_CHAR(A.DTMOV, 'MM/YYYY')  AS MES_REF,
                    A.CODUSUR,
                    A.CODEPTO,
                    C.DESCRICAO,
                    ROUND((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / B.QTPESOPREV) * 100, 2) AS PERC_FEITO,
                    ROUND(B.QTPESOPREV, 2)                                   AS META,
                    ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2)                          AS REALIZADO,
                    ROUND(B.QTPESOPREV - SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2)          AS FALTA,
                    NVL(P.PESO_POTENCIAL, 0)                                  AS PESO_POTENCIAL,
                    ROUND(((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) + NVL(P.PESO_POTENCIAL, 0)) / B.QTPESOPREV) * 100, 2) AS PERC_POTENCIAL,
                    CASE
                        WHEN NVL(P.PESO_POTENCIAL, 0) > 0 THEN
                            ROUND(
                                ((SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) + NVL(P.PESO_POTENCIAL, 0)) / B.QTPESOPREV) * 100
                                - (SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / B.QTPESOPREV) * 100,
                                2
                            )
                        ELSE NULL
                    END AS GANHO
                FROM PCMOV A
                JOIN PCMETA B  ON A.CODEPTO = B.CODIGO AND A.CODUSUR = B.CODUSUR
                JOIN PCDEPTO C ON A.CODEPTO = C.CODEPTO
                LEFT JOIN PESO_POTENCIAL P ON A.CODEPTO = P.CODEPTO
                JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                WHERE A.CODUSUR = :codvendedor
                  AND A.CODOPER LIKE 'S%'
                  AND A.DTMOV >= TRUNC(SYSDATE, 'MM')
                  AND A.DTMOV <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
                  AND B.DATA  >= TRUNC(SYSDATE, 'MM')
                  AND B.DATA  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
                GROUP BY
                    A.CODUSUR, A.CODEPTO, TO_CHAR(A.DTMOV, 'MM/YYYY'),
                    B.QTPESOPREV, C.DESCRICAO, P.PESO_POTENCIAL
                ORDER BY A.CODEPTO
            `;
            const result = await conn.execute(sql, { codvendedor: codvendedorAlvo });

            if (result.rows.length === 0) {
                await this.webhookPoller.enviarMensagemBot(telefone, `📊 Nenhuma meta encontrada para o vendedor ${codvendedorAlvo} neste mês.`, conn, instanceName);
                return;
            }

            const mesRef = result.rows[0][0];
            const rowsData = result.rows.map(row => ({
                codepto:        parseInt(row[2])    || 0,
                descricao:      String(row[3] || ''),
                percFeito:      parseFloat(row[4])  || 0,
                meta:           parseFloat(row[5])  || 0,
                realizado:      parseFloat(row[6])  || 0,
                falta:          parseFloat(row[7])  || 0,
                pesoPotencial:  parseFloat(row[8])  || 0,
                percPotencial:  parseFloat(row[9])  || 0,
                ganho:          row[10] != null ? parseFloat(row[10]) : null,
            }));

            const sqlClientes = `
                WITH MEDIA_PRODUTOS AS (
                    SELECT
                        A.CODCLI,
                        A.CODEPTO,
                        SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) / COUNT(A.CODPROD) AS AVG_PESO_PRODUTO
                    FROM PCMOV A
                    JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                    WHERE A.CODUSUR = :codvendedor
                      AND A.CODOPER LIKE 'S%'
                      AND A.DTMOV < TRUNC(SYSDATE, 'MM')
                      AND EXISTS (
                          SELECT 1 FROM PCEST E
                          WHERE E.CODPROD = A.CODPROD AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' AND E.QTESTGER > 0
                      )
                    GROUP BY A.CODCLI, A.CODEPTO, A.CODPROD
                    HAVING SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ) > 0
                )
                SELECT
                    C.CODCLI,
                    NVL(C.FANTASIA, C.CLIENTE)                        AS CLIENTE,
                    C.CGCENT,
                    TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY')               AS DTULTCOMP,
                    M.CODEPTO,
                    D.DESCRICAO,
                    ROUND(SUM(M.AVG_PESO_PRODUTO), 2)                  AS PESO
                FROM PCCLIENT C
                JOIN MEDIA_PRODUTOS M ON M.CODCLI = C.CODCLI
                JOIN PCDEPTO D ON D.CODEPTO = M.CODEPTO
                WHERE C.CODUSUR1 = :codvendedor
                  AND C.DTULTCOMP >= TRUNC(SYSDATE) - 90
                  AND C.DTULTCOMP <  TRUNC(SYSDATE, 'MM')
                GROUP BY
                    C.CODCLI, NVL(C.FANTASIA, C.CLIENTE), C.CGCENT,
                    TO_CHAR(C.DTULTCOMP, 'DD/MM/YYYY'), M.CODEPTO, D.DESCRICAO
                ORDER BY C.CODCLI, M.CODEPTO
            `;
            const resClientes = await conn.execute(sqlClientes, { codvendedor: codvendedorAlvo });

            const rowsClientes = resClientes.rows.map(r => ({
                codcli:    r[0],
                cliente:   r[1],
                cgcent:    r[2],
                dtultcomp: r[3],
                codepto:   r[4],
                descricao: r[5],
                peso:      r[6],
            }));

            let nomeVendedor = codvendedorAlvo;
            try {
                const resNome = await conn.execute(
                    `SELECT NOME FROM PCUSUARI WHERE CODUSUR = :codvendedor`,
                    { codvendedor: codvendedorAlvo }
                );
                if (resNome.rows.length > 0) nomeVendedor = String(resNome.rows[0][0] || '');
            } catch (_) {}

            let diasRestantes = 0, diasCorridos = 1, diasTotais = 1;
            let ativosNoMes   = 0, totalCarteira = 0;
            try {
                const resDias = await conn.execute(`
                    SELECT
                        (SELECT COUNT(*) FROM (
                            SELECT TRUNC(SYSDATE) + LEVEL AS DIA FROM DUAL
                            CONNECT BY TRUNC(SYSDATE) + LEVEL <= LAST_DAY(TRUNC(SYSDATE))
                        ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                                NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_RESTANTES,
                        (SELECT COUNT(*) FROM (
                            SELECT TRUNC(SYSDATE,'MM') - 1 + LEVEL AS DIA FROM DUAL
                            CONNECT BY TRUNC(SYSDATE,'MM') - 1 + LEVEL <= TRUNC(SYSDATE)
                        ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                                NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_CORRIDOS,
                        (SELECT COUNT(*) FROM (
                            SELECT TRUNC(SYSDATE,'MM') - 1 + LEVEL AS DIA FROM DUAL
                            CONNECT BY TRUNC(SYSDATE,'MM') - 1 + LEVEL <= LAST_DAY(TRUNC(SYSDATE))
                        ) WHERE TRIM(TO_CHAR(DIA,'DAY','NLS_DATE_LANGUAGE=AMERICAN'))
                                NOT IN ('SATURDAY','SUNDAY'))                    AS DIAS_TOTAIS,
                        (SELECT COUNT(DISTINCT M.CODCLI)
                         FROM PCMOV M
                         WHERE M.CODUSUR = :codvendedor
                           AND M.CODOPER LIKE 'S%'
                           AND M.DTMOV >= TRUNC(SYSDATE, 'MM')
                           AND M.DTMOV <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)) AS ATIVOS_MES,
                        (SELECT COUNT(*)
                         FROM PCCLIENT
                         WHERE CODUSUR1 = :codvendedor)                          AS TOTAL_CARTEIRA
                    FROM DUAL
                `, { codvendedor: codvendedorAlvo });
                if (resDias.rows.length > 0) {
                    diasRestantes = parseInt(resDias.rows[0][0]) || 0;
                    diasCorridos  = parseInt(resDias.rows[0][1]) || 1;
                    diasTotais    = parseInt(resDias.rows[0][2]) || 1;
                    ativosNoMes   = parseInt(resDias.rows[0][3]) || 0;
                    totalCarteira = parseInt(resDias.rows[0][4]) || 0;
                }
            } catch (e) { console.warn('[VendedorBot] Erro contexto:', e.message); }

            let realizadoMesAnt = 0, metaMesAnt = 0;
            try {
                const resMesAnt = await conn.execute(`
                    SELECT
                        NVL((SELECT ROUND(SUM((A.QT-NVL(A.QTDEVOL,0)) * X.PESOLIQ), 2) FROM PCMOV A
                             JOIN PCPRODUT X ON A.CODPROD = X.CODPROD
                             WHERE A.CODUSUR = :codvendedor AND A.CODOPER LIKE 'S%'
                               AND A.DTMOV >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-1)
                               AND A.DTMOV <  TRUNC(SYSDATE,'MM')), 0) AS REAL_ANT,
                        NVL((SELECT ROUND(SUM(B.QTPESOPREV), 2) FROM PCMETA B
                             WHERE B.CODUSUR = :codvendedor
                               AND B.DATA >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-1)
                               AND B.DATA <  TRUNC(SYSDATE,'MM')), 0)  AS META_ANT
                    FROM DUAL
                `, { codvendedor: codvendedorAlvo });
                if (resMesAnt.rows.length > 0) {
                    realizadoMesAnt = parseFloat(resMesAnt.rows[0][0]) || 0;
                    metaMesAnt      = parseFloat(resMesAnt.rows[0][1]) || 0;
                }
            } catch (e) { console.warn('[VendedorBot] Erro mês anterior:', e.message); }

            const totalRealizado = rowsData.reduce((s, r) => s + r.realizado, 0);
            const totalMeta      = rowsData.reduce((s, r) => s + r.meta,      0);
            const totalFalta     = Math.max(0, totalMeta - totalRealizado);
            const kgDiaNecessario = diasRestantes > 0 ? totalFalta / diasRestantes : 0;
            const projecaoKg     = (diasCorridos > 0 ? totalRealizado / diasCorridos : 0) * diasTotais;
            const projecaoPerc   = totalMeta > 0 ? (projecaoKg / totalMeta) * 100 : 0;
            const percMesAnt     = metaMesAnt > 0 ? (realizadoMesAnt / metaMesAnt) * 100 : null;

            const resumo = {
                diasRestantes, diasCorridos, diasTotais, kgDiaNecessario, ativosNoMes,
                totalCarteira, projecaoPerc, percMesAnt
            };

            let rowsObjetivos = [];
            try {
                const sqlObjetivos = `
                    WITH CALENDAR AS (
                        SELECT TRUNC(SYSDATE, 'MM') + LEVEL - 1 AS DATA
                        FROM DUAL
                        CONNECT BY TRUNC(SYSDATE, 'MM') + LEVEL - 1 < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
                    )
                    SELECT 
                        TO_CHAR(C.DATA, 'DD/MM/YYYY') AS DATA,
                        CASE 
                            WHEN NVL(SUM(B.VLTOTAL), 0) > 0 AND NVL(A.VLVENDAPREV, 0) = 0 THEN 1
                            ELSE NVL(A.VLVENDAPREV, 0)
                        END AS OBJETIVO,
                        NVL(SUM(B.VLTOTAL), 0) AS FEITO,
                        ROUND(
                            (NVL(SUM(B.VLTOTAL), 0) / 
                            NULLIF(
                                CASE 
                                    WHEN NVL(SUM(B.VLTOTAL), 0) > 0 AND NVL(A.VLVENDAPREV, 0) = 0 THEN 1
                                    ELSE NVL(A.VLVENDAPREV, 0)
                                END, 0
                            )) * 100, 2
                        ) AS PERC
                    FROM CALENDAR C
                    LEFT JOIN PCMETARCA A ON C.DATA = A.DATA AND A.CODUSUR = :codvendedor
                    LEFT JOIN PCNFSAID B ON C.DATA = B.DTSAIDA AND B.CODUSUR = :codvendedor
                    GROUP BY C.DATA, A.VLVENDAPREV
                    ORDER BY C.DATA
                `;
                const resObj = await conn.execute(sqlObjetivos, { codvendedor: codvendedorAlvo });
                rowsObjetivos = resObj.rows.map(r => ({
                    data: r[0], objetivo: parseFloat(r[1]) || 0,
                    feito: parseFloat(r[2]) || 0, perc: r[3] != null ? parseFloat(r[3]) : 0
                }));
            } catch (e) {
                console.warn('[VendedorBot] Erro ao buscar objetivos diários:', e.message);
            }

            try {
                const { gerarImagemMetas } = require('./metasImageService');
                await this.webhookPoller.enviarMensagemBot(telefone, `📊 Gerando painel de objetivos para: *${nomeVendedor}*...`, conn, instanceName);
                const base64Pdf = await gerarImagemMetas(mesRef, rowsData, rowsClientes, nomeVendedor, resumo, rowsObjetivos);
                await this.webhookPoller.enviarDocumentoBot(
                    telefone,
                    base64Pdf,
                    `objetivos_${nomeVendedor.replace(/[^a-zA-Z0-9]/g, '')}_${mesRef.replace('/', '_')}.pdf`,
                    'application/pdf',
                    conn,
                    instanceName
                );
            } catch (imgErr) {
                console.warn('[VendedorBot] Fallback texto — falha na geração de PDF:', imgErr.message);
                const barraProgresso = (perc) => {
                    const filled = Math.round(Math.min(perc, 100) / 10);
                    return '█'.repeat(filled) + '░'.repeat(10 - filled);
                };
                let linhas = [`📊 *Objetivos de ${nomeVendedor} (${mesRef})*\n`];
                for (const row of rowsData) {
                    const bateu    = row.percFeito >= 100;
                    const emoji    = bateu ? ' 🎉' : '';
                    const faltaTxt = row.falta < 0
                        ? `*+${Math.abs(row.falta).toFixed(1)} kg acima da meta*`
                        : `Faltam ${row.falta.toFixed(1)} kg`;
                    linhas.push(`*${row.descricao}*${emoji}\n` +
                        `${barraProgresso(row.percFeito)} ${row.percFeito.toFixed(1)}%\n` +
                        `Meta: ${row.meta.toFixed(1)} kg | Realizado: ${row.realizado.toFixed(1)} kg\n` +
                        `${faltaTxt}\n`);
                }
                await this.webhookPoller.enviarMensagemBot(telefone, linhas.join('\n'), conn, instanceName);
            }

        } catch (err) {
            console.error('[VendedorBot] Erro ao processar gerarEEnviarMetas:', err);
            await this.webhookPoller.enviarMensagemBot(telefone, `❌ Erro ao consultar objetivos de ${codvendedorAlvo}.`, conn, instanceName);
        }
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

        const hierarchySellers = await this.getHierarchySellers(codvendedor, conn);
        const sellersInClause = hierarchySellers.join(',');

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
            WHERE C.CODUSUR1 IN (${sellersInClause})
              AND T.STATUS = :status
            ORDER BY T.ID DESC
            FETCH FIRST 10 ROWS ONLY
        `;

        try {
            const result = await conn.execute(sql, { status: statusFilter }, {
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
            await this.webhookPoller.enviarMensagemBot(telefone, botMsgs.getMsg('VEND_CODCLI_INVALIDO'), conn, instanceName);
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
        const hierarchySellers = await this.getHierarchySellers(codvendedor, conn);
        
        if (!hierarchySellers.includes(parseInt(codusur1, 10))) {
            await this.webhookPoller.enviarMensagemBot(telefone, "⚠️ *Atenção:* Este cliente não pertence à sua carteira (ou à de sua equipe), portanto, você não pode abrir um ticket para ele.\n\nPor favor, informe outro CODCLI ou CNPJ, ou digite VOLTAR para cancelar.", conn, instanceName);
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

    async getRamosCarteiraVendedor(codvendedor, conn) {
        try {
            const hierarchySellers = await this.getHierarchySellers(codvendedor, conn);
            const validSellers = (hierarchySellers || []).map(s => parseInt(s, 10)).filter(s => !isNaN(s));

            if (validSellers.length > 0) {
                const binds = {};
                const placeholders = validSellers.map((cod, idx) => {
                    const param = `cod${idx}`;
                    binds[param] = cod;
                    return `:${param}`;
                }).join(', ');

                const sqlRamos = `
                    SELECT DISTINCT A.CODATIV, TRIM(A.RAMO) AS RAMO
                    FROM PCCLIENT C
                    JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                    WHERE C.CODUSUR1 IN (${placeholders})
                      AND A.RAMO IS NOT NULL
                    ORDER BY TRIM(A.RAMO)
                `;

                const res = await conn.execute(sqlRamos, binds);
                if (res.rows && res.rows.length > 0) {
                    return res.rows.map(r => ({
                        codativ: r[0],
                        ramo: r[1]
                    }));
                }
            }

            // Fallback: caso o vendedor ainda não tenha clientes com ramo vinculado, lista os ramos ativos da empresa
            const sqlFallback = `
                SELECT DISTINCT A.CODATIV, TRIM(A.RAMO) AS RAMO
                FROM PCATIVI A
                WHERE EXISTS (SELECT 1 FROM PCCLIENT C WHERE C.CODATV1 = A.CODATIV)
                  AND A.RAMO IS NOT NULL
                ORDER BY TRIM(A.RAMO)
                FETCH FIRST 15 ROWS ONLY
            `;
            const resFb = await conn.execute(sqlFallback);
            return resFb.rows.map(r => ({
                codativ: r[0],
                ramo: r[1]
            }));
        } catch (e) {
            console.error(`${TAG} Erro ao buscar ramos da carteira do vendedor ${codvendedor}:`, e);
            return [];
        }
    }

    async iniciarFluxoCatalogo(telefone, instanceName, conn, codvendedor) {
        const ramos = await this.getRamosCarteiraVendedor(codvendedor, conn);

        let ramosListaTxt = '';
        if (ramos && ramos.length > 0) {
            ramosListaTxt = ramos.map((r, i) => `${i + 1} - ${r.ramo}`).join('\n');
        } else {
            ramosListaTxt = '_(Nenhum segmento encontrado no momento)_';
        }

        const msgTpl = botMsgs.getMsg('VEND_CATALOGO_SOLICITAR');
        const msg = msgTpl.replace('{{ramos_lista}}', ramosListaTxt);

        await this.setState(telefone, 'VENDEDOR_CATALOGO_BUSCA', { ramos }, conn);
        await this.webhookPoller.enviarMensagemBot(telefone, msg, conn, instanceName);
    }

    async processarCatalogoBusca(telefone, text, instanceName, conn, dados, codvendedor) {
        const input = (text || '').trim();
        if (!input) return;

        const cmd = input.toLowerCase();
        if (cmd === 'voltar' || cmd === 'cancelar' || cmd === 'menu' || cmd === 'sair') {
            await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
            return await this.enviarMenuPrincipal(telefone, instanceName, conn);
        }

        const ramos = (dados && dados.ramos) ? dados.ramos : [];

        // 1. O vendedor digitou um número da lista de segmentos exibida?
        const numOption = parseInt(input, 10);
        if (!isNaN(numOption) && numOption >= 1 && numOption <= ramos.length && String(numOption) === input) {
            const ramoEscolhido = ramos[numOption - 1];
            return await this.gerarEEnviarCatalogo(telefone, ramoEscolhido.codativ, ramoEscolhido.ramo, instanceName, conn);
        }

        // 2. O vendedor digitou CNPJ/CPF ou CODCLI?
        const cleanDigits = input.replace(/[^0-9]/g, '');
        if (cleanDigits.length > 0) {
            try {
                const sqlCli = `
                    SELECT C.CODCLI, NVL(C.FANTASIA, C.CLIENTE) AS NOME, C.CODATV1, A.RAMO, C.CODUSUR1
                    FROM PCCLIENT C
                    LEFT JOIN PCATIVI A ON C.CODATV1 = A.CODATIV
                    WHERE C.CODCLI = :busca OR REPLACE(REPLACE(REPLACE(C.CGCENT, '.', ''), '/', ''), '-', '') = :busca
                    FETCH FIRST 1 ROWS ONLY
                `;
                const resCli = await conn.execute(sqlCli, { busca: cleanDigits });

                if (resCli.rows && resCli.rows.length > 0) {
                    const codcli = resCli.rows[0][0];
                    const nomeCli = (resCli.rows[0][1] || '').trim();
                    const codatv = resCli.rows[0][2];
                    const nomeRamo = resCli.rows[0][3] ? resCli.rows[0][3].trim() : '';

                    if (!codatv || !nomeRamo) {
                        await this.webhookPoller.enviarMensagemBot(
                            telefone,
                            `Cliente identificado: *${codcli} - ${nomeCli}*, mas ele não possui um Ramo de Atividade (Segmento) cadastrado.\n\nPor favor, escolha um dos segmentos da lista digitando o número correspondente.`,
                            conn,
                            instanceName
                        );
                        return;
                    }

                    await this.webhookPoller.enviarMensagemBot(
                        telefone,
                        `Cliente identificado: *${codcli} - ${nomeCli}*\nSegmento: *${nomeRamo}*`,
                        conn,
                        instanceName
                    );
                    return await this.gerarEEnviarCatalogo(telefone, codatv, nomeRamo, instanceName, conn);
                }
            } catch (errCli) {
                console.error(`${TAG} Erro ao buscar cliente por CODCLI/CNPJ:`, errCli);
            }
        }

        // 3. O vendedor digitou o nome do segmento/ramo (texto) ou código da atividade?
        // 3.1. Primeiro busca nos ramos da carteira
        const searchNorm = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let ramoEncontrado = ramos.find(r => {
            const rNorm = (r.ramo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return rNorm === searchNorm || rNorm.includes(searchNorm) || String(r.codativ) === input;
        });

        // 3.2. Se não encontrou na lista da carteira, busca na tabela geral de ramos (PCATIVI)
        if (!ramoEncontrado) {
            try {
                const sqlBuscaRamo = `
                    SELECT CODATIV, TRIM(RAMO) AS RAMO
                    FROM PCATIVI
                    WHERE UPPER(RAMO) LIKE UPPER('%' || :txt || '%')
                       OR TO_CHAR(CODATIV) = :exact
                    ORDER BY CASE WHEN UPPER(TRIM(RAMO)) = UPPER(:exact) THEN 0 ELSE 1 END, RAMO
                    FETCH FIRST 1 ROWS ONLY
                `;
                const resAtv = await conn.execute(sqlBuscaRamo, { txt: input, exact: input });
                if (resAtv.rows && resAtv.rows.length > 0) {
                    ramoEncontrado = {
                        codativ: resAtv.rows[0][0],
                        ramo: resAtv.rows[0][1]
                    };
                }
            } catch (e) {
                console.error(`${TAG} Erro ao buscar ramo na PCATIVI:`, e);
            }
        }

        if (ramoEncontrado) {
            return await this.gerarEEnviarCatalogo(telefone, ramoEncontrado.codativ, ramoEncontrado.ramo, instanceName, conn);
        }

        // Se nada foi encontrado:
        await this.webhookPoller.enviarMensagemBot(
            telefone,
            `⚠️ Não encontramos nenhum cliente (CODCLI/CNPJ) ou segmento correspondente a "*${input}*".\n\nPor favor, digite o número do segmento da lista, o nome do ramo, ou o CNPJ/CODCLI do cliente.\n\nDigite *VOLTAR* para retornar ao menu.`,
            conn,
            instanceName
        );
    }

    async gerarEEnviarCatalogo(telefone, codatv, nomeRamo, instanceName, conn) {
        console.log(`${TAG} [Catálogo] Gerando catálogo para Segmento: ${codatv} - ${nomeRamo} (Telefone: ${telefone})`);

        await this.webhookPoller.enviarMensagemBot(
            telefone,
            `⏳ Gerando o catálogo em PDF para o segmento *${nomeRamo}*... Aguarde alguns instantes.`,
            conn,
            instanceName
        );

        try {
            // 1. Busca produtos mais comprados por clientes deste segmento nos últimos 180 dias
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
                    A.CODPROD,
                    P.DESCRICAO,
                    NVL(B.PRECOFIXO, C.PTABELA) AS PVENDA,
                    A.UNIDADE,
                    A.CODAUXILIAR,
                    CASE WHEN B.PRECOFIXO IS NOT NULL THEN 'OPORTUNIDADE' ELSE '' END AS TIPO_PRECO
                FROM PCEMBALAGEM A
                JOIN COMPRAS_GERAIS CG ON CG.CODPROD = A.CODPROD
                LEFT JOIN PCPRECOPROM B 
                       ON A.CODAUXILIAR = B.CODAUXILIAR 
                      AND B.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}
                      AND TRUNC(SYSDATE) BETWEEN B.DTINICIOVIGENCIA AND B.DTFIMVIGENCIA
                      AND B.DTINICIOVIGENCIA IS NOT NULL
                      AND B.DTFIMVIGENCIA IS NOT NULL
                LEFT JOIN PCTABPR C 
                       ON A.CODPROD = C.CODPROD 
                      AND C.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}
                JOIN PCPRODUT P 
                  ON A.CODPROD = P.CODPROD
                JOIN PCEST E 
                  ON A.CODPROD = E.CODPROD 
                 AND A.CODFILIAL = E.CODFILIAL 
                 AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' 
                 AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
                WHERE A.ENVIAFV = 'S'
                  AND A.DTINATIVO IS NULL
                  AND NVL(P.OBS2, 'X') NOT IN ('FL')
                ORDER BY 
                    CASE WHEN B.PRECOFIXO IS NOT NULL THEN 0 ELSE 1 END,
                    A.CODPROD
                FETCH FIRST 50 ROWS ONLY
            `;
            let resProd = await conn.execute(sqlProdutos, { codatv });

            // 2. Se não houver compras recentes desse ramo específico, faz fallback para produtos gerais disponíveis
            if (resProd.rows.length === 0) {
                const sqlProdutosGerais = `
                    SELECT 
                        A.CODPROD,
                        P.DESCRICAO,
                        NVL(B.PRECOFIXO, C.PTABELA) AS PVENDA,
                        A.UNIDADE,
                        A.CODAUXILIAR,
                        CASE WHEN B.PRECOFIXO IS NOT NULL THEN 'OPORTUNIDADE' ELSE '' END AS TIPO_PRECO
                    FROM PCEMBALAGEM A
                    LEFT JOIN PCPRECOPROM B 
                           ON A.CODAUXILIAR = B.CODAUXILIAR 
                          AND B.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}
                          AND TRUNC(SYSDATE) BETWEEN B.DTINICIOVIGENCIA AND B.DTFIMVIGENCIA
                          AND B.DTINICIOVIGENCIA IS NOT NULL
                          AND B.DTFIMVIGENCIA IS NOT NULL
                    LEFT JOIN PCTABPR C 
                           ON A.CODPROD = C.CODPROD 
                          AND C.NUMREGIAO = ${process.env.TABPR_NUMREGIAO || 1}
                    JOIN PCPRODUT P 
                      ON A.CODPROD = P.CODPROD
                    JOIN PCEST E 
                      ON A.CODPROD = E.CODPROD 
                     AND A.CODFILIAL = E.CODFILIAL 
                     AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}' 
                     AND (E.QTESTGER - E.QTBLOQUEADA - E.QTRESERV) > 0
                    WHERE A.ENVIAFV = 'S'
                      AND A.DTINATIVO IS NULL
                      AND NVL(P.OBS2, 'X') NOT IN ('FL')
                    ORDER BY 
                        CASE WHEN B.PRECOFIXO IS NOT NULL THEN 0 ELSE 1 END,
                        A.CODPROD
                    FETCH FIRST 50 ROWS ONLY
                `;
                resProd = await conn.execute(sqlProdutosGerais);
            }

            if (resProd.rows.length === 0) {
                await this.webhookPoller.enviarMensagemBot(
                    telefone,
                    `Nenhum produto com estoque disponível encontrado no momento para o segmento *${nomeRamo}*.`,
                    conn,
                    instanceName
                );
                await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
                return await this.enviarMenuPrincipal(telefone, instanceName, conn);
            }

            // 3. Verifica exibição de preço
            let catalogoComPreco = true;
            try {
                const resConf = await conn.execute(`SELECT VALOR FROM CANAL_CONFIGURACOES WHERE CHAVE = 'BOT_CATALOGO_COM_PRECO'`);
                if (resConf.rows.length > 0 && resConf.rows[0][0] === 'OFF') {
                    catalogoComPreco = false;
                }
            } catch (e) {
                console.error(`${TAG} [Catálogo] Erro ao ler conf BOT_CATALOGO_COM_PRECO:`, e);
            }

            // 4. Gera PDF usando PDFKit
            const PDFDocument = require('pdfkit');
            const fs = require('fs');
            const path = require('path');

            const pdfBase64 = await new Promise((resolve, reject) => {
                const doc = new PDFDocument({ margin: 30, size: 'A4' });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => {
                    const pdfData = Buffer.concat(buffers).toString('base64');
                    resolve(pdfData);
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

                    // Background da célula
                    doc.rect(x, currentY, cellW, rowHeight - 15).fillAndStroke('#ffffff', '#e2e8f0');

                    if (imagePath) {
                        try {
                            doc.image(imagePath, x + 5, currentY + 5, { fit: [cellW - 10, 100], align: 'center', valign: 'center' });
                        } catch (err) {
                            doc.rect(x + 5, currentY + 5, cellW - 10, 100).fill('#f1f5f9');
                            doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Erro Imagem', x, currentY + 50, { width: cellW, align: 'center' });
                        }
                    } else {
                        doc.rect(x + 5, currentY + 5, cellW - 10, 100).fill('#f1f5f9');
                        doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text('Sem Imagem', x, currentY + 50, { width: cellW, align: 'center' });
                    }

                    // Textos
                    const subtitle = ean ? `Cód: ${codprod} | EAN: ${ean}` : `Cód: ${codprod}`;
                    doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(subtitle, x + 5, currentY + 115, { width: cellW - 10 });
                    doc.fillColor('#1e293b').fontSize(10).font('Helvetica-Bold').text(descricao, x + 5, currentY + 128, { width: cellW - 10, height: 25, ellipsis: true });

                    // Preço e unidade
                    if (catalogoComPreco) {
                        doc.fillColor('#0284c7').fontSize(14).font('Helvetica-Bold').text(precoVal, x + 5, currentY + 160, { width: cellW - 10, align: 'left' });
                        doc.fillColor('#64748b').fontSize(9).font('Helvetica-Bold').text(`/ ${unidade}`, x + 5, currentY + 164, { width: cellW - 10, align: 'right' });
                    } else {
                        doc.fillColor('#64748b').fontSize(10).font('Helvetica-Bold').text('Consulte condições', x + 5, currentY + 160, { width: cellW - 10, align: 'center' });
                    }

                    // Badge de Oportunidade
                    const tipoPreco = r[5] || '';
                    if (tipoPreco === 'OPORTUNIDADE') {
                        doc.rect(x + cellW - 55, currentY + 10, 50, 15).fill('#ef4444');
                        doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text('OFERTA', x + cellW - 55, currentY + 14, { width: 50, align: 'center' });
                    }

                    doc.fillColor('black');
                    currentCol++;
                });

                doc.end();
            });

            // 5. Salva em disco (se diretório existir ou puder ser criado)
            let uploadCatDir = '/app/SAC/UPLOAD/Catalogo';
            if (!fs.existsSync(uploadCatDir)) {
                uploadCatDir = path.join(__dirname, '../../SAC/UPLOAD/Catalogo');
            }
            try {
                if (!fs.existsSync(uploadCatDir)) fs.mkdirSync(uploadCatDir, { recursive: true });
                const fileNameCat = `Catalogo_${nomeRamo.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}.pdf`;
                fs.writeFileSync(path.join(uploadCatDir, fileNameCat), Buffer.from(pdfBase64, 'base64'));
            } catch (errSave) {
                console.warn(`${TAG} [Catálogo] Aviso ao salvar cópia em disco:`, errSave.message);
            }

            // 6. Envia documento via WhatsApp
            const fileNameDoc = `Catalogo_${nomeRamo.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
            await this.webhookPoller.enviarDocumentoBot(telefone, pdfBase64, fileNameDoc, 'application/pdf', conn, instanceName);
            await this.webhookPoller.enviarMensagemBot(telefone, `✅ *Catálogo (${nomeRamo})* enviado com sucesso!`, conn, instanceName);

        } catch (err) {
            console.error(`${TAG} [Catálogo] Erro ao gerar catálogo:`, err);
            await this.webhookPoller.enviarMensagemBot(telefone, 'Ocorreu um erro ao gerar o catálogo em PDF. Tente novamente mais tarde.', conn, instanceName);
        }

        // 7. Retorna ao menu principal
        await this.setState(telefone, 'VENDEDOR_MENU_PRINCIPAL', {}, conn);
        await this.enviarMenuPrincipal(telefone, instanceName, conn);
    }
}

module.exports = VendedorBotService;
