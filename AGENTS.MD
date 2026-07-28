# Diretrizes e Configurações para Agentes IA (AGENTS.MD)

Este documento dita as regras de negócio e orienta o comportamento de Inteligências Artificiais e Desenvolvedores que atuam no repositório. O objetivo é manter a consistência arquitetural do Canal de Comunicação.

---

## 1. Processo de Resolução e Criação (Para Agentes IA)

Se durante a criação de funcionalidades, refatoração ou análise de código o Agente **não localizar** um recurso necessário (ex: uma tabela não existe, falta um endpoint, ou uma view do ERP não foi encontrada), o Agente DEVE seguir este processo para resolver o bloqueio autonomamente:

1. **Análise de Domínio**: Avalie se a dependência ausente pertence ao escopo local (Sistema de Chat/Canal) ou ao ERP externo (Winthor/PC).
2. **Criação Nativa (Escopo Local / CANAL_)**: Se a tabela ou recurso fizer parte do projeto local, o Agente **TEM PERMISSÃO E DEVE** criar os scripts nativos (via `CREATE TABLE IF NOT EXISTS` em `.sql` ou via código Node.js nas migrations) para que o banco crie a estrutura automaticamente na inicialização.
3. **Mock e Views (Escopo ERP / PC)**: Se o recurso pertencer ao Winthor (Tabelas PC), o Agente **NÃO PODE** alterar as tabelas brutas. Nesse caso, ele DEVE sugerir/criar uma abstração usando Views (`VW_CANAL_*`) ou criar *mocks* de dados na aplicação local para prosseguir o desenvolvimento sem quebrar a integração principal.
4. **Registro de Alterações**: Toda nova tabela, rotina ou view gerada deve ser documentada e embutida no processo de `init.sql` do banco.

---

## 2. Regras para Hierarquia de Acesso

O sistema funciona sobre uma hierarquia estrita para proteção de dados comerciais, com exceção do Bot Gestor.

### 2.1 BOT_GESTOR
*   **Poderes**: Super Administrador absoluto.
*   **Regra**: Não obedece à hierarquia. Ele pode ver tudo, todos os chats, todas as carteiras de todos os usuários.

### 2.2 Gerente
*   **Poderes**: Pode listar todas as carteiras de clientes e chats de todos os supervisores e vendedores associados abaixo dele.

### 2.3 Supervisor
*   **Poderes**: Pode listar todas as carteiras e chats de todos os vendedores diretamente associados a ele.

### 2.4 Vendedor
*   **Poderes**: Restrito à sua própria carteira. Pode listar e interagir apenas com os clientes vinculados ao seu código no ERP.

---

## 3. Regras para Carteira de Clientes (Performance e Filtros)

Para evitar sobrecarga de banco de dados e lentidão no frontend, a listagem de clientes possui regras específicas de *Lazy Loading* baseadas na hierarquia.

### 3.1 BOT_GESTOR, Gerente e Supervisor
*   **Comportamento**: A tela **não deve** fazer o pré-carregamento (fetch total) de todos os clientes ao abrir. O carregamento de dados só deve ocorrer quando o usuário selecionar um Vendedor específico ou informar dados na busca.
*   **Permissões**: Podem editar os dados de contato local (telefone/whatsapp) de qualquer cliente da sua hierarquia.
*   **Filtros Obrigatórios**:
    *   Vendedor (Dropdown/Select).
    *   Nome do Cliente (Busca baseada em `PCCLIENT.FANTASIA` ou `PCCLIENT.CLIENTE`).
    *   CNPJ / CPF (Busca baseada em `PCCLIENT.CGCCPF`).

### 3.2 Vendedor
*   **Comportamento**: Por possuir uma carteira delimitada, o carregamento pode ocorrer respeitando limites de paginação normal.
*   **Permissões**: Pode editar os dados de contato local (telefone/whatsapp) dos seus próprios clientes.
*   **Filtros Obrigatórios**:
    *   Nome do Cliente (Busca baseada em `PCCLIENT.FANTASIA` ou `PCCLIENT.CLIENTE`).
    *   CNPJ / CPF (Busca baseada em `PCCLIENT.CGCCPF`).

---

## 4. Integração Assíncrona e Webhooks (Regra Estrutural)

Para garantir escalabilidade, a recepção de mensagens do WhatsApp ocorre em um modelo de arquitetura orientada a eventos em duas fases. Os Agentes devem respeitar essa arquitetura ao criar novas funcionalidades:

1. **Recepção e Buffer (JCWEBHOOK)**: Eventos que chegam da API externa (Evolution/GO) DEVEM ser recebidos de forma rápida e ter seu *payload bruto* embutido na tabela `JCWEBHOOK`. Esta tabela atua APENAS como fila/buffer. Nenhum endpoint de front-end deve fazer `SELECT` nela para exibição de histórico.
2. **Worker e Processamento (webhookPoller.js)**: A inteligência de extração (textos, downloads de mídias, transcrição de áudios via IA) ocorre num worker isolado. O worker lê a `JCWEBHOOK`, trata o JSON e insere o registro consolidado na `CANAL_MENSAGENS`.
3. **Consumo de Histórico**: Consultas de API para recuperar o chat (`/chat`, `/mensagens`) DEVEM ler exclusivamente da `CANAL_MENSAGENS`.
