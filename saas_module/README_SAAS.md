# Implementação do Módulo SaaS

Este diretório (`saas_module`) contém a base estrutural para transformar o projeto de comunicação em um SaaS licenciado, com túnel reverso e provisionamento automático.

## Como integrar ao projeto original

### 1. Incorporando os Serviços Node.js
Mova os arquivos `.js` para a pasta `src/services/` e `src/controllers/` do seu Backend:
- `licensePoller.js` -> `backend/src/services/`
- `tailscaleService.js` -> `backend/src/services/`
- `evoGoService.js` -> `backend/src/services/`
- `webhookController.js` -> `backend/src/controllers/` (Sobrescrever o existente ou criar versão)

### 2. Rotas do Express
No seu `backend/src/routes/webhook.js` atual, crie a nova rota que usa parâmetro dinâmico para amarrar o Webhook à origem (instância):
```javascript
const webhookController = require('../controllers/webhookController');

// Rota dinâmica: /api/webhook/whats/vendedor.AGDIST
router.post('/whats/:instancia', webhookController.handleEvolutionWebhook);
```

### 3. Start do Sistema (server.js ou worker.js)
No ponto de inicialização do seu servidor (provavelmente `worker.js`), inicie os processos em background:
```javascript
const tailscaleService = require('./services/tailscaleService');
const licensePoller = require('./services/licensePoller');

(async () => {
    // 1. Inicia o Tailscale Funnel e obtém a URL pública
    const publicUrl = await tailscaleService.setupAndGetFunnelUrl(3001);
    if (publicUrl) {
        process.env.PUBLIC_WEBHOOK_URL = publicUrl; // Guarda globalmente
    }

    // 2. Inicia o Cão de Guarda (Licenciamento via Supabase)
    // Ele será responsável por deletar instâncias se o limite estourar
    licensePoller.startGuard();
})();
```

### 4. Variáveis Obrigatórias (.env)
Adicione no `.env` do cliente e da infraestrutura:
```env
# Tailscale (OAuth ou AuthKey fixa)
TS_AUTHKEY=tskey-auth-...

# Supabase (Controle Central de Licenças do SaaS)
SUPABASE_URL=https://seusupabase.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
CLIENT_ID=WMS_CLIENTE_01

# API da Evolution GO
EVO_GO_URL=https://143.95.163.38
EVO_GO_GLOBAL_TOKEN=seu_token_global_aqui
```

### 5. Configuração do Docker
Adapte o arquivo `docker-compose.yml` raiz utilizando as referências de serviço contidas no `docker-compose.saas.yml` fornecido.
