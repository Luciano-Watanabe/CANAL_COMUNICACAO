# Plano de Implementação: "Status Whats" (Monitor de Conversas)

Objetivo: Criar uma visualização "read-only" de todas as conversas de WhatsApp, acessível apenas para perfis `GERENTE` e `BOT_GESTOR`.

## 1. Backend (Rotas e Segurança)
- [ ] Verificar endpoint `GET /api/chat/todas-mensagens` em `backend/src/routes/chat.js` para garantir que ele retorne o histórico correto de mensagens para qualquer instância, quando solicitado por um gestor.
- [ ] Implementar middleware ou verificação direta de `role` para garantir que apenas `GERENTE` e `BOT_GESTOR` possam acessar os dados de todas as conversas.

## 2. Frontend (UI/UX)
- [ ] Refatorar `frontend/src/pages/StatusWhats.tsx` para seguir o layout WhatsApp:
    - Sidebar: Lista de instâncias (de `CANAL_TOKENS_EVOLUTION`) e conversas recentes (de `CANAL_MENSAGENS`).
    - Main: Exibição cronológica do chat selecionado.
- [ ] Implementar componentes de UI para:
    - Visualização de mensagens de texto.
    - Player de áudio com suporte a transcrição.
    - Visualização de imagens/vídeos.
- [ ] Garantir que não haja elementos de input de texto ou botões de envio na interface.

## 3. Acesso e Permissões
- [ ] Ajustar `frontend/src/layouts/RootLayout.tsx` para garantir que o ícone de "Status Whats" seja renderizado apenas se o usuário tiver cargo `GERENTE` ou `BOT_GESTOR`.
- [ ] Proteger a rota `/status-whats` em `frontend/src/App.tsx` para reforçar a verificação de permissão no lado do cliente.

## 4. Validação
- [ ] Testar acesso como `VENDEDOR` (deve ser negado).
- [ ] Testar acesso como `GERENTE` (deve ter acesso total).
- [ ] Verificar carregamento de dados de múltiplas instâncias de WhatsApp.

## Estimativa de Esforço
- 1 a 2 dias de trabalho.
