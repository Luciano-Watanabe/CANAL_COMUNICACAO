# Canal de Comunicação - Documentação e Configurações

Bem-vindo ao **Canal de Comunicação**, um sistema robusto de gestão de atendimento e prospecção via WhatsApp. O sistema possui integração direta com a **Evolution API** para envio e recebimento de mensagens, inteligência artificial (GROK e GROQ) para suporte aos atendentes, geração de textos e transcrição de áudio, além de um Bot avançado de triagem (SAC).

---

## ⚙️ Configurações do Sistema

Abaixo está a explicação detalhada de cada opção disponível na aba **Configurações** do painel do Gestor/Gerente, fiel ao que está implementado no projeto:

### 1. Modos de Operação (Privacidade e Testes)
- **Modo Apresentação (Gravação de Vídeo):** Quando ativado, oculta em tempo real informações sensíveis na tela (Nomes de clientes, CNPJ, Inscrição Estadual e Telefones) em toda a aplicação. Ideal para demonstrações de tela ou gravações sem expor dados reais.
- **Modo Teste do Sistema (Exclusivo Bot Gestor):** É uma trava de segurança e testes. Quando ativado, **TODAS** as mensagens enviadas pela aplicação (sejam respostas de clientes ou disparos de vendedores) serão bloqueadas de ir para o destinatário final e redirecionadas para o **número de telefone de teste** especificado.

### 2. Agendamento do Cron de Envios
Define as janelas de tempo em que a fila de mensagens automáticas do sistema (como mensagens de reativação) está autorizada a realizar disparos.
- **Dias de Funcionamento:** Permite selecionar os dias da semana (ex: Seg a Sex) em que os envios ocorrerão.
- **Hora Inicial e Hora Final:** Intervalo de horas no dia (ex: das 8h às 18h) onde os disparos são permitidos. Evita que o sistema mande mensagens automáticas de madrugada.

### 3. Integrações Globais (APIs e Tokens)
Essas chaves habilitam os superpoderes do sistema, como IA e pesquisa de dados:
- **URL Base Global da Evolution API:** O endereço principal do servidor da Evolution API (ex: `https://api.evolution.com`). Será usado como URL padrão caso o vendedor não tenha uma URL específica configurada.
- **Chave de API do Groq (Transcrição de Áudio):** Token de acesso à API do Groq (`gsk_...`). Utilizada para receber áudios dos clientes no WhatsApp e transcrevê-los rapidamente para texto na tela.
- **Chave de API do GROK (xAI - Geração de Textos):** Token de acesso da xAI (`xai-...`). É a inteligência artificial responsável por sugerir respostas para os atendentes no SAC (com base no histórico de chat) de forma inteligente.
- **Token LocationIQ & Token Geoapify (Geolocalização):** Chaves usadas como provedores primário e secundário (fallback) para buscar coordenadas geográficas a partir de endereços e montar mapas no sistema.
- **Token CNPJA (Busca de Leads B2B):** Chave utilizada no módulo de **Radar de Leads**, permitindo que o sistema faça prospecção de empresas ativas diretamente da base do `cnpja.com`.
- **Páginas CNPJ Transparência:** Define o número de páginas (máximo 10) que o robô gratuito interno de raspagem deve varrer ao buscar informações abertas na internet.

### 4. Contatos Fixos (Menu do Bot)
- **Contato do Financeiro (WhatsApp) & Contato de Compras (WhatsApp):** Os números de WhatsApp configurados aqui são injetados diretamente na opção 9 (Fornecedores) da triagem do Bot. Quando o cliente escolher falar com compras ou financeiro, será direcionado a estes respectivos números.

### 5. Estatísticas de Uso da Inteligência Artificial (SAC)
Um painel analítico que monitora os gastos com a API do Grok:
- Mostra em tempo real a quantidade de requisições de IA feitas **Hoje**, na **Semana** e no **Mês**.
- Compara com o **Limite Configurado** no banco de dados e exibe uma **Barra de Progresso (X% Utilizado)**. Se o uso ultrapassar 90% do limite, a barra fica vermelha para alertar o gestor.

### 6. Instâncias do WhatsApp (Vendedores e Gestores)
Esta tabela é o coração da conexão com o WhatsApp. Para cada usuário, você pode definir:
- **Nome da Instância:** O nome da instância cadastrada na Evolution API.
- **Apresentação (Atendente):** Como o atendente deve ser identificado para o cliente no prefixo das mensagens (Ex: `Ana (Robô)` ou `João (Vendedor)`).
- **API URL Global / Específica:** O endereço do servidor da Evolution. Se em branco, usa a Global definida acima.
- **API Token (Evolution):** O apikey de acesso para disparar mensagens e conectar a instância na Evolution.
- **Status do WhatsApp:** Um monitor visual. Se estiver desconectado, exibe o QR Code em tela para ser lido pelo celular.
- **Bot Oficial? (Bot de Triagem):** Permite eleger (através de um *radio button*) qual desses números será o "SAC Oficial" da empresa. Apenas o número marcado assumirá o papel de disparar o menu de triagem inicial (Bot) e enviar avaliações (NPS).

### 7. Departamentos do SAC (Atendimento Bot)
Gerencia os setores para os quais os clientes podem ser direcionados.
- **Nome do Departamento:** Ex: Financeiro, Logística, Vendas, etc.
- **Sub-departamento:** Permite hierarquizar. Por exemplo, "Boleto" e "Notas Fiscais" podem ser sub-departamentos de "Financeiro". O bot mostrará primeiro os departamentos principais, e caso selecionado, listará os sub-departamentos.
- **Status (Ativar/Desativar):** É possível ocultar um departamento do menu do bot sem excluí-lo do banco de dados, clicando em Desativar.
