/**
 * BotMensagensService
 * -------------------
 * Singleton que mantém um cache em memória de todas as mensagens configuráveis
 * dos bots (SAC e Vendedor). Os bots consultam este serviço via getMsg(chave)
 * em vez de usar strings hardcoded.
 *
 * Estratégia de cache:
 *   - Carregado uma vez na inicialização do processo (server.js e worker.js)
 *   - Refresh automático a cada 5 minutos
 *   - Fallback: se a chave não existir no banco, retorna o texto padrão definido aqui
 */

const oraclePool = require('./oraclePool');

// ─────────────────────────────────────────────────────────────────────────────
// TEXTOS PADRÃO (fallback)
// Estes são os textos originais dos bots. Se uma chave não estiver no banco,
// este valor é usado. Também é o que aparece como "padrão" na interface.
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULTS = {

    // ── SAC BOT ─────────────────────────────────────────────────────────────

    SAC_MENU_SAUDACAO_COM_NOME: {
        descricao: 'Saudação inicial do menu SAC (cliente identificado)',
        grupo: 'Menu Principal SAC',
        bot_tipo: 'SAC',
        template: 'Olá *{{nome_cliente}}*, sou o assistente virtual do {{nome_atendente}}. Como posso te ajudar hoje?'
    },
    SAC_MENU_SAUDACAO_SEM_NOME: {
        descricao: 'Saudação inicial do menu SAC (cliente não identificado)',
        grupo: 'Menu Principal SAC',
        bot_tipo: 'SAC',
        template: 'Olá! Sou o assistente virtual do {{nome_atendente}}. Como posso te ajudar hoje?'
    },
    SAC_MENU_OPCOES: {
        descricao: 'Lista de opções do menu principal SAC',
        grupo: 'Menu Principal SAC',
        bot_tipo: 'SAC',
        template: 'Digite o número da opção desejada:\n\n1️⃣ - Status de Pedido / Entrega\n2️⃣ - 2ª Via de Boleto e Notas Fiscais\n3️⃣ - Pegar Catálogo\n4️⃣ - Trocas e Devoluções\n5️⃣ - Quero me Cadastrar (Novos Clientes)\n6️⃣ - Falar com meu Vendedor\n7️⃣ - Abrir Chamado (Atendimento Humano)\n8️⃣ - Consultar ticket\n9️⃣ - Fornecedor\n0️⃣ - Finalizar Atendimento'
    },
    SAC_ENCERRAR_ATENDIMENTO: {
        descricao: 'Mensagem exibida ao encerrar o atendimento (opção 0)',
        grupo: 'Encerramento SAC',
        bot_tipo: 'SAC',
        template: 'Atendimento finalizado. Qualquer nova mensagem iniciará um novo atendimento. Até logo!'
    },
    SAC_ERRO_GENERICO: {
        descricao: 'Mensagem de erro genérico no fluxo do bot SAC',
        grupo: 'Erros SAC',
        bot_tipo: 'SAC',
        template: 'Desculpe, ocorreu um erro ao processar sua solicitação. Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.'
    },
    SAC_GLOBAL_PEDIR_CNPJ: {
        descricao: 'Solicita CNPJ/CPF para autenticar o cliente antes de mostrar opção protegida',
        grupo: 'Autenticação SAC',
        bot_tipo: 'SAC',
        template: 'Para acessar esta opção, por favor informe o seu *CNPJ* ou *CPF* (apenas números).'
    },
    SAC_CNPJ_INVALIDO: {
        descricao: 'CNPJ ou CPF informado é inválido ou não encontrado',
        grupo: 'Autenticação SAC',
        bot_tipo: 'SAC',
        template: 'CNPJ ou CPF inválido. Digite apenas números.\n\nPara voltar ao menu, digite VOLTAR.'
    },
    SAC_PEDIDO_PEDIR_NUMERO: {
        descricao: 'Solicita número do pedido ou CNPJ para consulta de status',
        grupo: 'Pedidos SAC',
        bot_tipo: 'SAC',
        template: 'Para consultar o status do seu pedido, por favor digite o *Número do Pedido* ou o *CNPJ* cadastrado (apenas números).'
    },
    SAC_FINANCEIRO_PEDIR_NOTA: {
        descricao: 'Solicita número da NF ou CNPJ para emitir 2ª via/PIX',
        grupo: 'Financeiro SAC',
        bot_tipo: 'SAC',
        template: 'Para baixar a 2ª via da Nota Fiscal ou Gerar PIX, por favor digite o *Número da Nota Fiscal* ou o seu *CNPJ*.'
    },
    SAC_CATALOGO_PEDIR_CNPJ: {
        descricao: 'Solicita CNPJ para gerar catálogo de produtos',
        grupo: 'Catálogo SAC',
        bot_tipo: 'SAC',
        template: 'Para gerar o seu catálogo, por favor me informe o seu *CNPJ* (apenas números).'
    },
    SAC_CADASTRO_JA_EXISTE: {
        descricao: 'Informa que o cliente já possui cadastro ao tentar se cadastrar novamente',
        grupo: 'Cadastro SAC',
        bot_tipo: 'SAC',
        template: 'Você já possui cadastro conosco! Para retornar ao menu anterior, use VOLTAR.\nPara finalizar o atendimento use 0.'
    },
    SAC_CADASTRO_PEDIR_CNPJ: {
        descricao: 'Solicita CNPJ para iniciar o processo de cadastro de novo cliente',
        grupo: 'Cadastro SAC',
        bot_tipo: 'SAC',
        template: 'Para iniciar seu cadastro, por favor digite o seu *CNPJ* (apenas números).'
    },
    SAC_DEVOLUCAO_INICIO: {
        descricao: 'Mensagem de início do fluxo de Troca e Devolução',
        grupo: 'Devoluções SAC',
        bot_tipo: 'SAC',
        template: 'Você entrou no menu de Trocas e Devoluções.\nSeu chamado foi iniciado sob o número *#{{ticket_id}}*.\nPor favor, envie as *FOTOS* do produto, da caixa e um breve relato do problema.\n\nQuando terminar de enviar, digite *OK* para eu registrar, ou *0* para voltar.'
    },
    SAC_TICKETS_PEDIR_CNPJ: {
        descricao: 'Solicita CNPJ para consultar tickets do cliente',
        grupo: 'Tickets SAC',
        bot_tipo: 'SAC',
        template: 'Para consultar seus tickets, por favor digite o seu *CNPJ* (apenas números) ou digite *1* para buscar os tickets vinculados a este número de telefone.'
    },
    SAC_TICKET_CHAT_ENCERRAR: {
        descricao: 'Aviso exibido quando o cliente está em chat de ticket ativo (para sair, digitar SAIR)',
        grupo: 'Tickets SAC',
        bot_tipo: 'SAC',
        template: 'Atendimento finalizado. Se precisar de algo, basta mandar uma mensagem novamente. Até logo!'
    },
    SAC_FORNECEDOR_MENU: {
        descricao: 'Menu de opções para fornecedores',
        grupo: 'Fornecedor SAC',
        bot_tipo: 'SAC',
        template: '🏭 *Área de Fornecedores*\n\nComo posso ajudar?\n\n1 - Enviar documentos\n2 - Consultar status de NF\n0 - Voltar ao menu principal'
    },

    // ── VENDEDOR BOT ─────────────────────────────────────────────────────────

    VEND_MENU_PRINCIPAL: {
        descricao: 'Menu principal do Copiloto do Vendedor',
        grupo: 'Menu Principal Vendedor',
        bot_tipo: 'VENDEDOR',
        template: '💼 *Copiloto do Vendedor*\n\nOlá! Como posso te ajudar hoje?\n\n1️⃣ - 💬 Assistente de Comunicação\n2️⃣ - 📊 Meus Objetivos\n3️⃣ - 🎫 Consultar Tickets da Carteira\n4️⃣ - 🎫 Abrir ticket para cliente\n5️⃣ - 🔍 Consultar CNPJ/CPF\n0️⃣ - Finalizar'
    },
    VEND_ENCERRAR_ATENDIMENTO: {
        descricao: 'Mensagem de encerramento do atendimento do Vendedor Bot',
        grupo: 'Encerramento Vendedor',
        bot_tipo: 'VENDEDOR',
        template: 'Atendimento finalizado. Boa vendas!'
    },
    VEND_ERRO_GENERICO: {
        descricao: 'Mensagem de erro genérico no fluxo do bot Vendedor',
        grupo: 'Erros Vendedor',
        bot_tipo: 'VENDEDOR',
        template: 'Desculpe, ocorreu um erro. Digite VOLTAR.'
    },
    VEND_ASSIST_BUSCA_CLIENTE: {
        descricao: 'Solicita CODCLI ou CNPJ para o assistente de comunicação',
        grupo: 'Assistente Vendedor',
        bot_tipo: 'VENDEDOR',
        template: '💬 *Assistente de Comunicação*\n\nQual CODCLI ou CNPJ/CPF do cliente que deseja analisar?\n\nDigite VOLTAR caso queira cancelar.'
    },
    VEND_CODCLI_INVALIDO: {
        descricao: 'Código ou CNPJ inválido informado ao assistente',
        grupo: 'Assistente Vendedor',
        bot_tipo: 'VENDEDOR',
        template: 'Código ou CNPJ inválido. Por favor, digite apenas números.\n\nQual CODCLI ou CNPJ/CPF do cliente?'
    },
    VEND_TICKET_STATUS_MENU: {
        descricao: 'Menu de consulta de status de tickets pelo vendedor',
        grupo: 'Tickets Vendedor',
        bot_tipo: 'VENDEDOR',
        template: '🎫 *Consultar Tickets*\n\nQual status você deseja consultar?\n1 - Abertos\n2 - Em Atendimento\n\nDigite o número da opção desejada ou VOLTAR.'
    },
    VEND_TICKET_ABRIR_BUSCA: {
        descricao: 'Solicita CODCLI ou CNPJ para abrir ticket em nome de cliente',
        grupo: 'Tickets Vendedor',
        bot_tipo: 'VENDEDOR',
        template: 'Qual CODCLI ou CNPJ do cliente?\n\nDigite VOLTAR caso queira cancelar.'
    },
    VEND_CNPJ_CONSULTA: {
        descricao: 'Solicita CNPJ ou CPF para consulta de cadastro',
        grupo: 'Consulta CNPJ Vendedor',
        bot_tipo: 'VENDEDOR',
        template: '🔍 *Consulta de Cadastro*\n\nDigite o *CNPJ* ou *CPF* que deseja consultar (apenas números).\n\nDigite VOLTAR para retornar ao menu.'
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE EM MEMÓRIA
// ─────────────────────────────────────────────────────────────────────────────
let _cache = {}; // { chave: template_string }
let _loaded = false;
let _refreshInterval = null;

/**
 * Carrega todas as mensagens personalizadas do banco para o cache.
 * Chama automaticamente na inicialização e a cada 5 minutos.
 */
async function loadCache() {
    try {
        const conn = await oraclePool.getConnection();
        const result = await conn.execute(
            `SELECT CHAVE, TEMPLATE FROM CANAL_BOT_MENSAGENS`,
            [],
            { outFormat: require('oracledb').OUT_FORMAT_OBJECT }
        );
        await conn.close();

        const novo = {};
        for (const row of result.rows) {
            let tpl = row.TEMPLATE;
            // Oracle CLOBs podem retornar objeto com método getData()
            if (tpl && typeof tpl.getData === 'function') {
                tpl = await tpl.getData();
            }
            novo[row.CHAVE] = tpl;
        }
        _cache = novo;
        _loaded = true;
        console.log(`[BOT-MSGS] Cache carregado: ${Object.keys(_cache).length} mensagens personalizadas.`);
    } catch (err) {
        console.error('[BOT-MSGS] Erro ao carregar cache de mensagens:', err.message);
        // Não lança erro — fallbacks continuam funcionando
    }
}

/**
 * Inicia o refresh automático do cache a cada 5 minutos.
 */
function startAutoRefresh() {
    if (_refreshInterval) return;
    _refreshInterval = setInterval(loadCache, 5 * 60 * 1000);
    console.log('[BOT-MSGS] Auto-refresh de mensagens iniciado (5 min).');
}

/**
 * Retorna o template de uma mensagem.
 * Prioridade: banco de dados (cache) > fallback padrão > string vazia
 *
 * @param {string} chave - Identificador da mensagem (ex: 'SAC_MENU_SAUDACAO_COM_NOME')
 * @param {string} [fallbackOverride] - Texto alternativo (substitui o default se informado)
 * @returns {string}
 */
function getMsg(chave, fallbackOverride) {
    if (_cache[chave] !== undefined && _cache[chave] !== null) {
        return _cache[chave];
    }
    if (fallbackOverride !== undefined) {
        return fallbackOverride;
    }
    if (DEFAULTS[chave]) {
        return DEFAULTS[chave].template;
    }
    console.warn(`[BOT-MSGS] Chave desconhecida: "${chave}". Retornando string vazia.`);
    return '';
}

/**
 * Retorna todos os defaults (para popular o banco na primeira vez e
 * exibir na UI como "texto padrão").
 */
function getAllDefaults() {
    return DEFAULTS;
}

module.exports = {
    loadCache,
    startAutoRefresh,
    getMsg,
    getAllDefaults
};
