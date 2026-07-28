# Documentação de Perfis de Acesso e Menus (Canal de Comunicação)

O sistema "Canal de Comunicação" possui um controle de acesso baseado em papéis (RBAC - Role Based Access Control) para garantir que cada usuário tenha acesso apenas às informações e ferramentas pertinentes à sua função.

Os três perfis principais são:
1. **VENDEDOR** (Representante Comercial / RCA)
2. **SUPERVISOR**
3. **GERENTE**

Abaixo, detalhamos o que cada perfil pode visualizar e fazer em cada opção do menu lateral.

---

## 1. Dashboard (`/`)

Painel principal que exibe métricas de desempenho, metas e indicadores gerais.

* **VENDEDOR:**
  * Visualiza apenas o seu **próprio desempenho** e os seus indicadores.
  * Acompanha o atingimento da sua meta pessoal, número de atendimentos realizados e positivação da sua carteira.
* **SUPERVISOR:**
  * Visualiza os indicadores agregados de toda a sua equipe.
  * Pode acompanhar o desempenho individual de cada vendedor que responde a ele.
* **GERENTE:**
  * Acesso total e irrestrito.
  * Visualiza o panorama global da filial/empresa e os indicadores somados de todas as equipes.

---

## 2. Carteira de Clientes (`/clientes`)

Módulo de gestão de clientes, onde é possível visualizar dados cadastrais, histórico financeiro e rentabilidade.

* **VENDEDOR:**
  * Visualiza **exclusivamente os clientes vinculados ao seu próprio código** (RCA) no Winthor.
  * Não consegue buscar ou acessar informações de clientes de outros vendedores.
* **SUPERVISOR / GERENTE:**
  * Acesso global a todos os clientes do ERP.
  * Pode filtrar os clientes por vendedor para analisar o trabalho de um RCA específico.
  * Tem visão privilegiada sobre limites de crédito globais e rentabilidade.

---

## 3. Chat (Atendimento) (`/chat`)

Interface de atendimento via WhatsApp e inteligência comercial integrada ao Winthor.

* **VENDEDOR:**
  * Pode conversar no WhatsApp com seus próprios clientes.
  * Acessa a aba de **Inteligência de Mix** para ver o que o cliente deixou de comprar ou produtos sugeridos.
  * Visualiza a aba de **Últimos Pedidos** e pode gerar mensagens automáticas de reposição (com opção de acréscimo percentual).
  * Consegue ver pendências financeiras e limite de crédito do seu cliente durante o atendimento.
* **SUPERVISOR / GERENTE:**
  * **Monitoramento:** Pode visualizar a tela de chat de qualquer vendedor em tempo real.
  * **Sussurro / Mensagem Interna:** Pode enviar mensagens no chat que aparecem apenas para o Vendedor (marcadas com o nome e cargo), mas que ficam invisíveis para o cliente final. Útil para orientar o vendedor durante uma negociação.
  * **Alertas:** Recebe alertas em tela (painel popup) quando um vendedor solicita ajuda durante um atendimento, podendo entrar no chat imediatamente com um clique.

---

## 4. Configurações (`/configuracoes`)

Área de administração do sistema.

* **VENDEDOR / SUPERVISOR:**
  * 🚫 **Acesso Bloqueado**. O menu não é exibido ou o acesso é bloqueado na tela.
* **GERENTE:**
  * ✅ **Acesso Liberado**.
  * Pode configurar parâmetros do sistema, instâncias do WhatsApp (Evolution API), sincronizações com o Winthor e gerenciar os acessos de outros usuários.

---

## 5. Campanhas (Status) (`/campanhas`)

Módulo para acompanhamento de disparos em massa, réguas de relacionamento e marketing.

* **VENDEDOR:**
  * 🚫 **Acesso Bloqueado**. O menu não é exibido.
* **SUPERVISOR / GERENTE:**
  * ✅ **Acesso Liberado**.
  * Pode visualizar os painéis de status de disparos de campanhas, taxa de leitura, engajamento e métricas de conversão de ações em lote.

---

> [!TIP]
> **Resumo da Lógica de Negócio (RBAC):**
> O sistema se baseia no campo `role` (Cargo) e `matricula` (Código RCA) do usuário logado. Todas as consultas ao banco de dados (Winthor) interceptam o `role` do usuário e aplicam a cláusula `WHERE CODUSUR = :matricula` caso o usuário seja apenas VENDEDOR.

---

## 6. Precificação Estimada do Projeto

Com base no escopo desenvolvido — um CRM completo omnichannel integrado nativamente ao ERP Winthor, com inteligência de mix, histórico de vendas, monitoramento em tempo real (WebSockets), RBAC (Perfis de Acesso) e integração com a Evolution API para WhatsApp — apresentamos a estimativa de valor para um projeto de software customizado com esta arquitetura.

### Levantamento de Esforço (Horas)

| Módulo / Funcionalidade | Esforço Estimado | Detalhamento |
| :--- | :---: | :--- |
| **Backend & Banco de Dados** | 60h | Configuração Node.js, rotas REST, conexão OracleDB (Thick Client), queries complexas no Winthor (PCMOV, PCPRODUT, etc). |
| **Frontend & UI/UX** | 50h | Interfaces em React, TailwindCSS, temas Claro/Escuro, responsividade, dashboards e telas de chat. |
| **Integração WhatsApp** | 30h | Conexão com Evolution API, envio e recebimento de mensagens, webhooks, gerenciamento de sessões. |
| **Lógica de Negócios (RBAC)** | 20h | Controle de permissões (Vendedor/Gerente), chat interno ("sussurro") via Socket.io e alertas em tempo real. |
| **Total Estimado** | **160 horas** | Desenvolvimento, testes e homologação inicial. |

### Valores de Investimento

Considerando o valor da hora técnica de desenvolvimento especializado (Sênior) entre **R$ 150,00 e R$ 250,00**:

* **Valor Mínimo Estimado:** R$ 24.000,00
* **Valor Máximo Estimado:** R$ 40.000,00
* **Preço Sugerido para Licenciamento (SaaS Customizado):** **R$ 32.500,00** (setup e implementação).

### Manutenção e Sustentação Mensal

Para manter a infraestrutura rodando, atualizar bibliotecas, prestar suporte a dúvidas e corrigir bugs pontuais, recomenda-se um contrato de suporte:

* **Sustentação Nível 2 e 3:** R$ 1.800,00 a R$ 2.500,00 / mês.
* *(Não inclui os custos de cloud e da API oficial ou não oficial do WhatsApp, que são pagos pelo próprio cliente).*
