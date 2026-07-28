-- Tabelas de Controle de Clientes e Contatos
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    codcli_winthor INTEGER UNIQUE NOT NULL, -- Código do cliente no ERP Winthor
    nome VARCHAR(255) NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contatos (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE CASCADE,
    telefone VARCHAR(50) UNIQUE NOT NULL, -- O número do WhatsApp (ex: 5511999999999)
    nome_contato VARCHAR(255),
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabelas para o Chat (Log Temporário)
CREATE TABLE IF NOT EXISTS conversas (
    id SERIAL PRIMARY KEY,
    contato_id INTEGER REFERENCES contatos(id),
    status VARCHAR(50) DEFAULT 'ABERTO', -- ABERTO, FINALIZADO, AGUARDANDO_SUPERVISOR
    vendedor_id INTEGER, -- ID do Vendedor no ERP/Sistema
    supervisor_id INTEGER, -- ID do Supervisor (se escalado)
    iniciado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finalizado_em TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mensagens (
    id SERIAL PRIMARY KEY,
    conversa_id INTEGER REFERENCES conversas(id) ON DELETE CASCADE,
    remetente VARCHAR(50) NOT NULL, -- 'CLIENTE', 'VENDEDOR', 'SUPERVISOR', 'SISTEMA'
    conteudo TEXT NOT NULL,
    tipo_mensagem VARCHAR(50) DEFAULT 'TEXTO', -- TEXTO, IMAGEM, DOCUMENTO
    enviado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para melhorar a performance de busca nas conversas ativas
CREATE INDEX IF NOT EXISTS idx_telefone_contato ON contatos(telefone);
CREATE INDEX IF NOT EXISTS idx_conversa_ativa ON conversas(status) WHERE status = 'ABERTO';

-- Tabelas de Métricas
CREATE TABLE IF NOT EXISTS metricas_cross_sell (
    id SERIAL PRIMARY KEY,
    codusur VARCHAR(50) NOT NULL,
    codprod VARCHAR(50) NOT NULL,
    data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

