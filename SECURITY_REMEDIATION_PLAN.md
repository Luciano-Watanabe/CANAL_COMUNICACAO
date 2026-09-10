# PLANEJAMENTO DE CORREÇÃO DE SEGURANÇA

**Projeto:** CANAL_COMUNICACAO_HOMOLOGACAO  
**Data:** 2026-09-04  
**Referência:** Auditoria de Segurança (27 findings: 8 CRÍTICO, 12 ALTO, 5 MÉDIO, 2 BAIXO)  
**Estimativa total:** 32-40 horas de desenvolvimento

---

## VISÃO GERAL DAS FASES

```
FASE 0 ─── Emergência (chaves, gitignore)              ~2h
  │
FASE 1 ─── Infraestrutura de Auth (JWT + middleware)     ~8h
  │
FASE 2 ─── Proteção de Rotas + Headers                  ~6h
  │
FASE 3 ─── Correções de Injeção (SQL + Command)         ~4h
  │
FASE 4 ─── Segurança de Uploads                         ~4h
  │
FASE 5 ─── Rate Limiting + Hardening                    ~4h
  │
FASE 6 ─── Frontend (token, cookies, cleanup)           ~6h
  │
FASE 7 ─── Testes + Validação                           ~4h
```

---

## FASE 0 — EMERGÊNCIA (Imediato, ~2h)

> **Objetivo:** Revogar credenciais comprometidas e proteger o repositório.  
> **Pode ser feito AGORA, sem dependências.**

### F0.1 — Adicionar `backend/config.json` ao `.gitignore`

**Arquivo:** `.gitignore`  
**Ação:** Adicionar linha:
```
backend/config.json
```

**Depois:** Remover do tracking do git:
```bash
git rm --cached backend/config.json
```

> ⚠️ Mesmo removido, o arquivo permanece no histórico do git. Se o repo é público/compartilhado, as keys já estão comprometidas.

### F0.2 — Limpar `.env.example` de credenciais reais

**Arquivo:** `.env.example`  
**Ação:** Substituir valores reais por placeholders:
```env
LOCATIONIQ_API_KEY=sua_chave_aqui
GEOAPIFY_API_KEY=sua_chave_aqui
```

### F0.3 — ROTACIONAR todas as API keys comprometidas

| Key | Onde está | Ação |
|-----|-----------|------|
| `GROQ_API_KEY` | `.env`, `.env.example`, `config.json`, `GET /api/config/global` | Gerar nova no console Groq |
| `GROK_API_KEY` | `config.json` | Gerar nova no console xAI |
| `LOCATIONIQ_API_KEY` | `.env`, `.env.example`, `config.json` | Gerar nova no console LocationIQ |
| `GEOAPIFY_API_KEY` | `.env`, `.env.example`, `config.json` | Gerar nova no console Geoapify |
| `TOKEN_121817072026` | hardcoded em `rotas.js:310`, `clientes.js:543` | Gerar nova no Evolution API |

### F0.4 — Remover tokens hardcoded do código fonte

**Arquivos:** `backend/src/routes/rotas.js:310`, `backend/src/routes/clientes.js:543`  
**Ação:** Substituir `'TOKEN_121817072026'` por variável de ambiente ou lookup do banco:
```javascript
// ANTES:
WHERE T.API_TOKEN = 'TOKEN_121817072026'

// DEPOIS:
WHERE T.CODUSUR = :codusur
```

### F0.5 — Remover telefone hardcoded

**Arquivo:** `backend/src/routes/clientes.js:532`  
**Ação:** Substituir por variável de ambiente:
```javascript
// ANTES:
telVendedor = '551281466409'; // Fallback padrao

// DEPOIS:
telVendedor = process.env.FALLBACK_PHONE || '';
```

### F0.6 — Adicionar phone ao `.env`

**Arquivo:** `.env`  
**Ação:** Adicionar:
```
FALLBACK_PHONE=551281466409
```

---

## FASE 1 — INFRAESTRUTURA DE AUTENTICAÇÃO (~8h)

> **Objetivo:** Criar sistema de autenticação JWT completo com middleware server-side.  
> **Dependências:** Fase 0 concluída.  
> **Novas dependências npm:** `jsonwebtoken`, `bcryptjs`

### F1.1 — Instalar dependências

```bash
cd backend
npm install jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs  # se usar TypeScript
```

### F1.2 — Criar middleware de autenticação

**Arquivo novo:** `backend/src/middleware/auth.js`

```javascript
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-secreta-forte-aqui-mude-em-producao';
const JWT_EXPIRES = '8h';

// Middleware de autenticação obrigatória
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, message: 'Token não fornecido.' });
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // { matricula, nome, role }
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
    }
}

// Middleware de autorização por cargo
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Acesso negado.' });
        }
        next();
    };
}

module.exports = { authenticate, authorize, JWT_SECRET, JWT_EXPIRES };
```

### F1.3 — Modificar endpoint de login para gerar JWT

**Arquivo:** `backend/src/routes/auth.js`

**Mudanças:**
1. Importar `jsonwebtoken` e `JWT_SECRET`
2. Após validação de senha, gerar token:
```javascript
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('../middleware/auth');

// Na linha 73, DEPOIS do if (userRow.SENHAFTP === password):
const token = jwt.sign(
    {
        matricula: userRow.CODUSUR,
        nome: userRow.NOME,
        role: roleFinal
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
);

return res.json({
    success: true,
    token,  // ← NOVO
    user: {
        matricula: userRow.CODUSUR,
        nome: userRow.NOME,
        nomeGuerra: userRow.NOME,
        role: roleFinal
    }
});
```

### F1.4 — Adicionar `JWT_SECRET` ao `.env`

```env
JWT_SECRET=uma_frase_secreta_forte_com_pelo_menos_32 caracteres_mude_em_producao
JWT_EXPIRES_IN=8h
```

### F1.5 — Adicionar variável de ambiente ao server.js

**Arquivo:** `backend/src/server.js` (após linha 24):
```javascript
// Tornar JWT_SECRET acessível globalmente
process.env.JWT_SECRET = process.env.JWT_SECRET || require('crypto').randomBytes(64).toString('hex');
```

### F1.6 — Proteger endpoint interno de emit

**Arquivo:** `backend/src/server.js:172`

**Substituir:**
```javascript
app.post('/api/internal/emit', (req, res) => {
```

**Por:**
```javascript
const INTERNAL_SECRET = process.env.INTERNAL_EMIT_SECRET || '';
app.post('/api/internal/emit', (req, res) => {
    const authHeader = req.headers['x-internal-secret'];
    if (!INTERNAL_SECRET || authHeader !== INTERNAL_SECRET) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    // ... resto do código
```

---

## FASE 2 — PROTEÇÃO DE ROTAS + HEADERS (~6h)

> **Objetivo:** Aplicar middleware de auth em todas as rotas e adicionar security headers.  
> **Dependências:** Fase 1 concluída.  
> **Novas dependências npm:** `helmet`, `express-rate-limit`

### F2.1 — Instalar dependências

```bash
cd backend
npm install helmet express-rate-limit
```

### F2.2 — Aplicar helmet no server.js

**Arquivo:** `backend/src/server.js` (após linha 24):
```javascript
const helmet = require('helmet');
app.use(helmet());
```

Isso adiciona automaticamente:
- `Content-Security-Policy`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security`
- `X-XSS-Protection`
- `Referrer-Policy`

### F2.3 — Restringir CORS ao domínio do frontend

**Arquivo:** `backend/src/server.js`

**Substituir linha 23:**
```javascript
// ANTES:
app.use(cors());

// DEPOIS:
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Não permitido pelo CORS'));
        }
    },
    credentials: true
}));
```

**Substituir configuração Socket.IO (linhas 16-21):**
```javascript
const io = new Server(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
    }
});
```

**Adicionar ao `.env`:**
```
CORS_ORIGINS=http://localhost:5173,https://seu-dominio.com.br
```

### F2.4 — Criar rotina de aplicação de middleware por grupo

**Estratégia:** Usar `router.use(authenticate)` nos routers que precisam de proteção total, e `router.use(authenticate, authorize('gerente', 'bot_gestor'))` nos sensíveis.

**Arquivo:** `backend/src/server.js` — Modificar import e uso:

```javascript
const { authenticate, authorize } = require('./middleware/auth');

// Rotas PÚBLICAS (apenas login)
app.use('/api/auth', authRoutes);

// Rotas protegidas por autenticação (TODAS as demais)
app.use('/api/clientes', authenticate, clientesRoutes);
app.use('/api/produtos', authenticate, produtosRoutes);
app.use('/api/chat', authenticate, chatRoutes);
app.use('/api/contatos', authenticate, contatosRoutes);
app.use('/api/vendedores', authenticate, vendedoresRoutes);
app.use('/api/visitas', authenticate, visitasRoutes);
app.use('/api/config', authenticate, configRoutes);
app.use('/api/webhook-config', authenticate, authorize('gerente', 'bot_gestor'), webhookConfigRoutes);
app.use('/api/rotas', authenticate, rotasRoutes);
app.use('/api/webhook', webhookRoutes);  // ← público (recebe callbacks da Evolution API)
app.use('/api/sac', authenticate, sacRoutes);
app.use('/api/templates', authenticate, templatesRoutes);
app.use('/api/templates_paginas', authenticate, mensagensTemplatesRoutes);
app.use('/api/automacoes', authenticate, automacoesRoutes);
app.use('/api/prospeccao', authenticate, prospeccaoRoutes);
app.use('/api', authenticate, avisosRoutes);
app.use('/api', authenticate, dashboardRoutes);
app.use('/api', authenticate, campanhasRoutes);
app.use('/api/analise-cnpj', authenticate, analiseCnpjRoutes);
app.use('/api/analise-ie', authenticate, analiseIeRoutes);
app.use('/api', authenticate, metricasRoutes);
app.use('/api', authenticate, whatsappRoutes);
app.use('/api/catalogo', authenticate, catalogoRoutes);
app.use('/api/geolocalizacao', authenticate, geolocalizacaoRoutes);
app.use('/api/objetivos', authenticate, objetivosRoutes);
app.use('/api/bot-mensagens', authenticate, botMensagensRoutes);
app.use('/api', authenticate, statusWhatsRoutes);
app.use('/api/relatorios', authenticate, relatoriosRoutes);
```

**⚠️ NOTA:** A rota `/api/webhook` deve permanecer pública pois recebe callbacks da Evolution API. Proteger com validação de token da Evolution API no futuro.

### F2.5 — Proteger endpoints específicos com ROLE

**Rotas que devem ser apenas GERENTE/BOT_GESTOR:**

| Rota | Proteção |
|------|----------|
| `POST /api/config/global` | `authorize('gerente', 'bot_gestor')` |
| `POST /api/config/token` | `authorize('gerente', 'bot_gestor')` |
| `DELETE /api/clientes/reativacao/*` | `authorize('gerente', 'bot_gestor')` |
| `POST /api/internal/emit` | Secret header (já feito na Fase 1) |

**Exemplo de aplicação em `config.js`:**
```javascript
const { authenticate, authorize } = require('../middleware/auth');

// No início do arquivo, após criar o router:
// Rotas de leitura: qualquer autenticado
router.use(authenticate);

// POST /global: apenas gerente/gestor
router.post('/global', authorize('gerente', 'bot_gestor'), async (req, res) => { ... });

// POST /token: apenas gerente/gestor
router.post('/token', authorize('gerente', 'bot_gestor'), async (req, res) => { ... });
```

### F2.6 — Filtrar API keys na resposta de GET /global

**Arquivo:** `backend/src/routes/config.js:98-121`

**Substituir:**
```javascript
// ANTES: retorna tudo包括 API keys
res.json({ success: true, configs });

// DEPOIS: filtra keys sensíveis
const SENSITIVE_KEYS = ['GROQ_API_KEY', 'GROK_API_KEY', 'CNPJA_API_KEY', 'LOCATIONIQ_API_KEY', 'GEOAPIFY_API_KEY'];
const safeConfigs = {};
for (const [key, value] of Object.entries(configs)) {
    if (SENSITIVE_KEYS.includes(key)) {
        safeConfigs[key] = value ? '••••••••' : null;  // Mascarado
    } else {
        safeConfigs[key] = value;
    }
}
res.json({ success: true, configs: safeConfigs });
```

---

## FASE 3 — CORREÇÕES DE INJEÇÃO (~4h)

> **Objetivo:** Corrigir SQL Injection e Command Injection.  
> **Dependências:** Nenhuma (pode paralelizar com Fase 1-2).

### F3.1 — Corrigir SQL Injection em `rotas.js:389`

**Arquivo:** `backend/src/routes/rotas.js:389`

**Substituir:**
```javascript
// ANTES (VULNERÁVEL):
const sqlTels = `SELECT CODCLI, NVL(TELCELENT, NVL(TELENT, TELCOB))
  FROM PCCLIENT WHERE CODCLI IN (${uniqueCodclis.join(',')})`;

// DEPOIS (SEGURO):
// Validar que todos são números
const safeCodclis = uniqueCodclis
    .filter(c => /^\d+$/.test(String(c)))
    .slice(0, 999);

if (safeCodclis.length === 0) {
    return res.status(400).json({ success: false, message: 'Nenhum código de cliente válido.' });
}

const inClause = safeCodclis.map((_, i) => `:cli${i}`).join(',');
const binds = {};
safeCodclis.forEach((c, i) => { binds[`cli${i}`] = Number(c); });

const sqlTels = `SELECT CODCLI, NVL(TELCELENT, NVL(TELENT, TELCOB))
  FROM PCCLIENT WHERE CODCLI IN (${inClause})`;

const resultTels = await connection.execute(sqlTels, binds);
```

### F3.2 — Corrigir interpolação de env vars em SQL (8+ arquivos)

**Arquivos afetados:**
- `backend/src/routes/objetivos.js:34,111`
- `backend/src/routes/clientes.js:185,425,432,592,599`
- `backend/src/routes/produtos.js:157,288,290`
- `backend/src/routes/catalogo.js:177,179`

**Padrão de correção (exemplo objetivos.js:34):**
```javascript
// ANTES:
`AND E.CODFILIAL = '${process.env.ESTOQUE_CODFILIAL || 1}'`

// DEPOIS:
`AND E.CODFILIAL = :estoqueFilial`
// ... binds: { estoqueFilial: parseInt(process.env.ESTOQUE_CODFILIAL) || 1 }
```

**Abordagem em larga escala:** Criar função helper em `backend/src/utils/sqlSanitizer.js`:
```javascript
/**
 * Sanitiza valor para uso em SQL bind variable.
 * Valida que é um número inteiro positivo.
 */
function safeInt(value, defaultValue = 0) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}

module.exports = { safeInt };
```

### F3.3 — Corrigir Command Injection em `webhookConfigController.js` e `server.js`

**Arquivos:**
- `backend/src/routes/webhookConfigController.js:99-101`
- `backend/src/server.js:219`

**Criar helper em `backend/src/utils/shellSanitizer.js`:**
```javascript
/**
 * Remove caracteres perigosos de strings usadas em comandos shell.
 * APENAS para uso com parâmetros de tailscale.
 */
function sanitizeHostname(name) {
    // Remove caracteres que não são válidos para hostname
    return String(name)
        .replace(/[^a-zA-Z0-9\-]/g, '')
        .substring(0, 63); // max hostname length
}

function sanitizePort(port) {
    const parsed = parseInt(port, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) return null;
    return parsed;
}

module.exports = { sanitizeHostname, sanitizePort };
```

**Substituir em `webhookConfigController.js:99`:**
```javascript
const { sanitizeHostname } = require('../utils/shellSanitizer');
const safeNomeEmpresa = sanitizeHostname(nomeEmpresa);
let upCmd = `tailscale up --hostname=${safeNomeEmpresa} --accept-routes --timeout=10s`;
```

**Substituir em `server.js:219`:**
```javascript
const { sanitizeHostname } = require('./utils/shellSanitizer');
const safeNomeEmpresa = sanitizeHostname(nomeEmpresa);
exec(`tailscale up --hostname=${safeNomeEmpresa} --accept-routes`, ...);
```

### F3.4 — Validar tipo de `porta` em webhookConfigController.js

**Arquivo:** `backend/src/routes/webhookConfigController.js:115`

```javascript
const { sanitizePort } = require('../utils/shellSanitizer');
const safePorta = sanitizePort(porta);
if (!safePorta) {
    return res.status(400).json({ success: false, message: 'Porta inválida.' });
}
exec(`tailscale funnel -bg ${safePorta}`, ...);
```

---

## FASE 4 — SEGURANÇA DE UPLOADS (~4h)

> **Objetivo:** Validar tipos MIME, sanitizar nomes de arquivo, prevenir path traversal.  
> **Dependências:** Nenhuma.

### F4.1 — Criar middleware de validação de uploads

**Arquivo novo:** `backend/src/middleware/uploadSecurity.js`

```javascript
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

// Mapa de MIME types permitidos por contexto
const ALLOWED_MIME = {
    media: [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'video/mp4', 'video/webm',
        'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/aac',
        'application/pdf'
    ],
    imagem: ['image/jpeg', 'image/png', 'image/webp'],
    video: ['video/mp4', 'video/webm'],
    audio: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
    documento: ['application/pdf', 'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'text/plain'],
    planilha: ['text/csv', 'application/vnd.ms-excel',
               'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
};

// Storage que gera nomes seguros
function createSecureStorage(destDir) {
    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, destDir),
        filename: (req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            const randomName = crypto.randomBytes(16).toString('hex');
            cb(null, `${Date.now()}_${randomName}${ext}`);
        }
    });
}

// Storage em memória para uploads que precisam de processamento
function createMemoryStorage() {
    return multer.memoryStorage();
}

// Filtro de arquivo por MIME type
function createFileFilter(allowedMimes) {
    return (req, file, cb) => {
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Tipo de arquivo não permitido: ${file.mimetype}`), false);
        }
    };
}

// Middleware multer pré-configurado
function secureUpload(context = 'media', storageType = 'memory') {
    const allowedMimes = ALLOWED_MIME[context] || ALLOWED_MIME.media;
    const storage = storageType === 'memory' ? createMemoryStorage() : createSecureStorage('../uploads');
    return multer({
        storage,
        fileFilter: createFileFilter(allowedMimes),
        limits: { fileSize: 50 * 1024 * 1024 } // 50MB
    });
}

module.exports = { secureUpload, ALLOWED_MIME };
```

### F4.2 — Aplicar em rotas de upload

**`chat.js`:**
```javascript
const { secureUpload } = require('../middleware/uploadSecurity');
const uploadMedia = secureUpload('media', 'memory');

router.post('/send-media', uploadMedia.single('file'), async (req, res) => { ... });
```

**`sac.js`:**
```javascript
const { secureUpload } = require('../middleware/uploadSecurity');
const uploadMedia = secureUpload('media', 'memory');

router.post('/tickets/:id/send-media', uploadMedia.single('file'), async (req, res) => { ... });
router.post('/tickets/internal', uploadMedia.single('file'), async (req, res) => { ... });
```

**`statusWhats.js`:**
```javascript
const { secureUpload } = require('../middleware/uploadSecurity');
// Remover configuração manual do multer
const upload = secureUpload('media', 'disk');

router.post('/status-whats/agendar', upload.single('midia'), async (req, res) => { ... });
```

**`catalogo.js`:**
```javascript
const { secureUpload } = require('../middleware/uploadSecurity');
const uploadPdf = secureUpload('documento', 'disk');

router.post('/send-whatsapp', uploadPdf.single('pdf'), async (req, res) => { ... });
```

**`campanhas.js`:**
```javascript
const { secureUpload } = require('../middleware/uploadSecurity');
const uploadImage = secureUpload('imagem', 'disk');

router.post('/campanhas/agendar', uploadImage.single('imagem'), async (req, res) => { ... });
```

### F4.3 — Proteger contra path traversal nos uploads

**No `sac.js:936-939`, adicionar validação:**
```javascript
// ANTES:
const ext = fileName.split('.').pop();
const savedFileName = `${msgId}.${ext}`;

// DEPOIS:
const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, '');
if (!ext || ext.length > 10) {
    return res.status(400).json({ error: 'Nome de arquivo inválido.' });
}
const savedFileName = `${msgId}${ext}`;
```

**No `chat.js`, aplicar o mesmo padrão.**

---

## FASE 5 — RATE LIMITING + HARDENING (~4h)

> **Objetivo:** Proteger contra brute force, abuso de API, e hardening geral.  
> **Dependências:** Fase 1 (JWT) para rate limiting autenticado.

### F5.1 — Rate limiting global

**Arquivo:** `backend/src/server.js` (após helmet):
```javascript
const rateLimit = require('express-rate-limit');

// Rate limit global (100 req/min por IP)
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: 'Muitas requisições. Tente novamente em 1 minuto.' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use(globalLimiter);
```

### F5.2 — Rate limiting específico no login (anti-brute force)

**Arquivo:** `backend/src/routes/auth.js` (antes do router):
```javascript
const rateLimit = require('express-rate-limit');

// Rate limit mais restritivo no login (5 tentativas/min por IP)
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { success: false, message: 'Muitas tentativas de login. Aguarde 1 minuto.' },
    standardHeaders: true,
    legacyHeaders: false
});

router.post('/login', loginLimiter, async (req, res) => { ... });
```

### F5.3 — Rate limiting em endpoints de escrita sensíveis

**Arquivo:** `backend/src/server.js`:
```javascript
// Rate limit para envio de mensagens (10/min por usuário)
const sendLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => req.user?.matricula || req.ip,
    message: { success: false, message: 'Limite de envio atingido.' }
});
app.use('/api/chat/send', authenticate, sendLimiter);
app.use('/api/chat/send-media', authenticate, sendLimiter);
```

### F5.4 — Proteger contra path traversal nos arquivos estáticos

**Arquivo:** `backend/src/server.js`

Configurar `express.static` com opções de segurança:
```javascript
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    dotfiles: 'deny',      // Bloqueia arquivos .env, .git, etc.
    index: false,           // Desabilita listagem de diretório
    maxAge: '1d'            // Cache de 1 dia
}));
app.use('/SAC/UPLOAD', express.static(path.join(__dirname, '../SAC/UPLOAD'), {
    dotfiles: 'deny',
    index: false,
    maxAge: '1d'
}));
```

### F5.5 — Remover console.log de dados sensíveis

**Arquivo:** `backend/src/routes/chat.js:412-413`

**Substituir:**
```javascript
// ANTES:
console.log(`[DEBUG] Tentando enviar para: ${evolutionUrl}`);
console.log(`[DEBUG] Body: number=${numberToSend}, text=${texto}`);

// DEPOIS:
// Remover ou usar level debug condicional
if (process.env.LOG_LEVEL === 'debug') {
    console.log(`[DEBUG] Enviando mensagem para instância`);
}
```

---

## FASE 6 — FRONTEND (~6h)

> **Objetivo:** Adaptar o frontend para usar JWT, httpOnly cookies, e limpar dados sensíveis.  
> **Dependências:** Fases 1-2 concluídas.

### F6.1 — Salvar token JWT no login

**Arquivo:** `frontend/src/pages/Login.tsx:29`

**Substituir:**
```typescript
// ANTES:
localStorage.setItem('user', JSON.stringify(data.user));

// DEPOIS:
localStorage.setItem('token', data.token);  // JWT
localStorage.setItem('user', JSON.stringify(data.user));  // dados do usuário (nome, role)
```

### F6.2 — Criar utilitário de API com token automático

**Arquivo novo:** `frontend/src/utils/api.ts`

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export async function apiGet<T = any>(path: string): Promise<T> {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${token || ''}`,
            'Content-Type': 'application/json'
        }
    });

    if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Sessão expirada');
    }

    return res.json();
}

export async function apiPost<T = any>(path: string, body?: any): Promise<T> {
    const token = localStorage.getItem('token');
    const isFormData = body instanceof FormData;

    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token || ''}`,
            ...(!isFormData && { 'Content-Type': 'application/json' })
        },
        body: isFormData ? body : body ? JSON.stringify(body) : undefined
    });

    if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Sessão expirada');
    }

    return res.json();
}

export async function apiDelete<T = any>(path: string): Promise<T> {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token || ''}`
        }
    });

    if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        throw new Error('Sessão expirada');
    }

    return res.json();
}
```

### F6.3 — Atualizar ProtectedRoute para verificar token

**Arquivo:** `frontend/src/components/ProtectedRoute.tsx`

```typescript
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
        return <Navigate to="/login" replace />;
    }

    // Verificar se o token não está expirado (básico, client-side)
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            return <Navigate to="/login" replace />;
        }
    } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return <Navigate to="/login" replace />;
    }

    return <Outlet />;
}
```

### F6.4 — Atualizar SocketContext para usar token

**Arquivo:** `frontend/src/contexts/SocketContext.tsx:17`

```typescript
// ANTES:
const userStr = localStorage.getItem('user');

// DEPOIS:
const token = localStorage.getItem('token');
const userStr = localStorage.getItem('user');
// Passar token no handshake:
const socket = io(SERVER_URL, {
    auth: { token }
});
```

**E no server.js, verificar o token no middleware do socket:**
```javascript
const jwt = require('jsonwebtoken');

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
        return next(new Error('Autenticação necessária'));
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.data = { role: decoded.role, matricula: decoded.matricula };
        next();
    } catch (err) {
        next(new Error('Token inválido'));
    }
});
```

### F6.5 — Atualizar chamadas de API existentes

**Aproximadamente 25+ arquivos** que fazem `fetch('/api/...')` precisam incluir o header `Authorization: Bearer <token>`.

**Abordagem:** Substituir chamadas `fetch` diretas pelo utilitário `apiGet`/`apiPost`/`apiDelete` criado no F6.2.

**Arquivos prioritários (mais usados):**
- `Dashboard.tsx` (~8 fetch calls)
- `Clientes.tsx` (~6 fetch calls)
- `Chat.tsx` (~5 fetch calls)
- `SAC.tsx` (~10 fetch calls)
- `Configuracoes.tsx` (~4 fetch calls)
- `Campanhas.tsx` (~4 fetch calls)
- `MonitorConversas.tsx` (~2 fetch calls)
- `RootLayout.tsx` (~1 fetch call)
- `Vendedores.tsx` (~3 fetch calls)
- Todos os demais pages/components com fetch

### F6.6 — Adicionar logout automático em 401

O utilitário `apiGet`/`apiPost` já faz redirect para `/login` em caso de 401 (implementado no F6.2).

### F6.7 — Remover `VITE_API_URL` do Geolocalizacao.tsx

**Arquivo:** `frontend/src/pages/Geolocalizacao.tsx:5`

**Substituir:**
```typescript
// ANTES:
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// DEPOIS:
import { apiGet, apiPost } from '../utils/api';
// Usar apiGet/apiPost em vez de fetch direto
```

---

## FASE 7 — TESTES + VALIDAÇÃO (~4h)

> **Objetivo:** Garantir que todas as correções funcionam e não quebraram funcionalidade existente.

### F7.1 — Testes de autenticação

| Teste | Esperado |
|-------|----------|
| GET `/api/config/vendedores` sem token | 401 Unauthorized |
| GET `/api/config/vendedores` com token válido | 200 + dados |
| GET `/api/config/vendedores` com token expirado | 401 Unauthorized |
| POST `/api/auth/login` com credenciais corretas | 200 + token JWT |
| POST `/api/auth/login` com credenciais incorretas | 401 |
| POST `/api/auth/login` 6 vezes seguidas | 429 Too Many Requests na 6ª tentativa |

### F7.2 — Testes de autorização

| Teste | Esperado |
|-------|----------|
| Vendedor acessa `POST /api/config/global` | 403 Forbidden |
| Gerente acessa `POST /api/config/global` | 200 |
| Vendedor acessa `DELETE /api/clientes/reativacao/*` | 403 |
| Bot_Gestor acessa `DELETE /api/clientes/reativacao/*` | 200 |

### F7.3 — Testes de SQL Injection

| Teste | Esperado |
|-------|----------|
| POST `/api/rotas/:id/disparar` com `clientes: ["1) OR 1=1--"]` | 400 ou sem efeito (filtrado) |
| POST `/api/config/global` com `ESTOQUE_CODFILIAL: "1 OR 1=1--"` | Aceito mas não causa injeção (bind var) |

### F7.4 — Testes de Command Injection

| Teste | Esperado |
|-------|----------|
| POST `/api/config/global` com `NOME_EMPRESA: "test$(whoami)"` | Hostname sanitizado, sem execução |

### F7.5 — Testes de upload

| Teste | Esperado |
|-------|----------|
| Upload de arquivo .exe como imagem | Rejeitado (MIME type mismatch) |
| Upload de arquivo > 50MB | Rejeitado (limit) |
| Upload com nome de arquivo `../../etc/passwd` | Nome sanitizado com hash aleatório |

### F7.6 — Testes de CORS

| Teste | Esperado |
|-------|----------|
| Request de `http://evil.com` | Bloqueado pelo CORS |
| Request de origem configurada | Permitido |

### F7.7 — Testes de headers de segurança

| Header | Esperado |
|--------|----------|
| `Content-Security-Policy` | Presente |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Strict-Transport-Security` | Presente (se HTTPS) |

---

## MATRIZ DE DEPENDÊNCIAS ENTRE FASES

```
FASE 0 (Emergência)
  │
  ├── FASE 3 (Injeções) ◄── pode paralelizar com Fase 1-2
  ├── FASE 4 (Uploads)   ◄── pode paralelizar com Fase 1-2
  │
  ├── FASE 1 (Auth JWT)
  │     │
  │     ├── FASE 2 (Proteção de Rotas + Headers)
  │     │     │
  │     │     ├── FASE 5 (Rate Limiting + Hardening)
  │     │     │
  │     │     └── FASE 6 (Frontend)
  │     │           │
  │     │           └── FASE 7 (Testes)
```

---

## DEPENDÊNCIAS NPM A INSTALAR

```bash
cd /opt/CANAL_COMUNICACAO_HOMOLOGACAO/backend
npm install jsonwebtoken bcryptjs helmet express-rate-limit
```

**Não instalar:**
- `passport` (overkill para este caso)
- `express-session` ( JWT é mais simples para SPA)

---

## ARQUIVOS A CRIAR

| Arquivo | Fase | Descrição |
|---------|------|-----------|
| `backend/src/middleware/auth.js` | 1 | Middleware JWT authenticate + authorize |
| `backend/src/middleware/uploadSecurity.js` | 4 | Validação de uploads com multer seguro |
| `backend/src/utils/sqlSanitizer.js` | 3 | Helpers para sanitização de valores SQL |
| `backend/src/utils/shellSanitizer.js` | 3 | Helpers para sanitização de comandos shell |
| `frontend/src/utils/api.ts` | 6 | Wrapper de fetch com token automático |

---

## ARQUIVOS A MODIFICAR

| Arquivo | Fases | Mudanças |
|---------|-------|----------|
| `.gitignore` | 0 | Adicionar `backend/config.json` |
| `.env.example` | 0 | Remover keys reais |
| `.env` | 0,1 | Adicionar `JWT_SECRET`, `FALLBACK_PHONE`, `CORS_ORIGINS`, `INTERNAL_EMIT_SECRET` |
| `backend/package.json` | 1,2 | Novas dependências |
| `backend/src/server.js` | 1,2,5 | helmet, cors restrito, auth middleware, rate limit, static seguros, socket auth |
| `backend/src/routes/auth.js` | 1,5 | JWT no login, rate limit no login |
| `backend/src/routes/config.js` | 2 | authenticate, authorize, mascarar API keys |
| `backend/src/routes/rotas.js` | 0,3 | Remover token hardcoded, bind variables |
| `backend/src/routes/clientes.js` | 0,3 | Remover token hardcoded, bind variables, remover telefone hardcoded |
| `backend/src/routes/chat.js` | 4,5 | Upload seguro, remover console.log |
| `backend/src/routes/sac.js` | 4 | Upload seguro, sanitizar filename |
| `backend/src/routes/statusWhats.js` | 4 | Upload seguro |
| `backend/src/routes/catalogo.js` | 3,4 | Bind variables, upload seguro |
| `backend/src/routes/campanhas.js` | 4 | Upload seguro |
| `backend/src/routes/importExport.js` | 4 | Upload seguro |
| `backend/src/routes/objetivos.js` | 3 | Bind variables |
| `backend/src/routes/produtos.js` | 3 | Bind variables |
| `backend/src/routes/webhookConfigController.js` | 3 | Sanitizar hostname, porta |
| `frontend/src/pages/Login.tsx` | 6 | Salvar token JWT |
| `frontend/src/components/ProtectedRoute.tsx` | 6 | Verificar token + expiração |
| `frontend/src/contexts/SocketContext.tsx` | 6 | Enviar token no handshake |
| `frontend/src/pages/Geolocalizacao.tsx` | 6 | Usar apiGet/apiPost |
| ~25 pages/components | 6 | Adicionar Authorization header |

---

## RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|-------|-----------|
| Breaking change no login | Manter fallback: se `token` não existe no response, frontend funciona sem auth (transição) |
| Rotas webhook da Evolution API | Manter `/api/webhook` pública, adicionar validação de token da Evolution API |
| Usuários logados são desconectados | Implementar refresh token ou sessão longa (8h) |
| Performance com JWT verify em cada request | JWT verify é ~0.1ms; negligible |
| Oracle DB passwords são plaintext | Não podemos mudar o ERP; manter comparação mas proteger com rate limit + HTTPS |

---

## ESTIMATIVA DE ESFORÇO POR FASE

| Fase | Horas | Dificuldade | Pode delegar? |
|------|-------|-------------|---------------|
| Fase 0 | 2h | Fácil | Sim |
| Fase 1 | 8h | Média | Parcialmente |
| Fase 2 | 6h | Média | Parcialmente |
| Fase 3 | 4h | Média | Sim |
| Fase 4 | 4h | Fácil-Média | Sim |
| Fase 5 | 4h | Fácil | Sim |
| Fase 6 | 6h | Média-Alta | Parcialmente |
| Fase 7 | 4h | Média | Sim |
| **TOTAL** | **38h** | | |

**Caminho crítico:** Fase 0 → Fase 1 → Fase 2 → Fase 6 → Fase 7  
**Paralelizável:** Fases 3, 4, 5 podem rodar simultaneamente com Fases 1-2
