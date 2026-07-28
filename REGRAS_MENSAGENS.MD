# Regras e Modelos de Mensagens Automáticas

Este documento define as regras de negócio e os modelos (templates) para as mensagens automáticas enviadas pelo Canal de Comunicação aos clientes e vendedores.

---

## 1. Regras Gerais de Disparo

- **Horário de Envio:** Mensagens automáticas (exceto respostas imediatas de chat) devem respeitar o horário comercial (Ex: 08:00 às 18:00).
- **Frequência:** Evitar o envio de múltiplas mensagens promocionais ou de cobrança no mesmo dia para o mesmo cliente, para evitar bloqueio por spam.
- **Tempo entre os envios:** As mensagens devem ter um tempo entre elas que varia a 1 a 267 segundos. Cada tempo é um ticket, até que os ticket acabem não pode haver repetição do ticket. Exemplo: Se enviou 1 mensagem e o ticket é de 222 segundos, deve aguardar os 222s para enviar. Para o proximo envio não poderá ter o 222s disponível.

- **Variáveis Disponíveis:** Ao utilizar os modelos abaixo, as variáveis entre chaves `{}` devem ser substituídas dinamicamente pelo sistema antes do envio.

---

## 2. Modelos de Mensagens

### 2.1. Sugestão de Mix de Produtos (Chat)
**Gatilho:** Quando o Vendedor ou Gestor seleciona produtos na tela de Chat e clica em "Enviar".
**Regra:** Enviar a mensagem abaixo, listando cada produto selecionado com seu respectivo preço e desconto (se houver).

**Modelo:**
> Olá {nome_cliente}, tudo bem?
> 
> Separamos algumas ofertas especiais para você abastecer o seu estoque. Confira o nosso mix sugerido:
> 
> {lista_produtos}
> 
> Gostou de alguma oferta? É só me responder por aqui que fecho o seu pedido!
> 
> Abraços,
> {nome_vendedor}

---

### 2.2. Agendamento de Visitas
**Gatilho:** Quando um Vendedor ou Gestor agenda uma nova visita na tela "Gestão de Visitas".
**Regra:** Disparar um lembrete automático 1 dia antes da visita ou no momento da criação do agendamento, dependendo da configuração.

**Modelo (Para o Cliente):**
> Olá {nome_cliente}!
> 
> Passando para confirmar nossa visita agendada para {data_visita} às {hora_visita}.
> Estarei aí para conversarmos sobre as melhores oportunidades e novidades.
> 
> Até logo!
> {nome_vendedor}

---

### 2.3. Mensagem de Boas-vindas (Primeiro Contato)
**Gatilho:** Quando um cliente entra em contato pelo WhatsApp pela primeira vez.
**Regra:** O bot deve responder imediatamente apresentando as opções principais.

**Modelo:**
> Olá, {nome_cliente}! Bem-vindo(a) ao atendimento da {nome_empresa}.
> 
> Como podemos ajudar você hoje?
> 1 - Fazer um pedido
> 2 - Falar com meu vendedor
> 3 - Financeiro (Boletos e Notas)
> 4 - Outros assuntos
> 
> Digite o número da opção desejada.

---

### 2.4. Resposta Fora do Horário Comercial
**Gatilho:** Quando um cliente envia mensagem fora do horário estipulado.
**Regra:** O sistema identifica o horário e dispara o aviso, informando quando o atendimento retornará.

**Modelo:**
> Olá! Recebemos a sua mensagem.
> 
> No momento, estamos fora do nosso horário de atendimento. Nossa equipe retornará o seu contato assim que possível, em nosso horário comercial (Segunda a Sexta, das 08h às 18h).
> 
> Agradecemos a compreensão!

---

## 3. Instruções para os Agentes de IA

Ao implementar novas automações ou modificar o código relacionado aos disparos (ex: arquivos em `/backend/src/routes/`), os Agentes de IA **devem**:
1. Consultar este arquivo para resgatar o texto da mensagem (evitando chumbá-lo "hardcoded" de forma rígida).
2. Verificar se o disparo da mensagem respeita as condições definidas nas "Regras Gerais de Disparo".

---

### 2.5. Reativação de Clientes Inativos
**Gatilho:** Disparo em massa ou manual focado em clientes inativos (sem compras há um determinado período).
**Regras de Envio:** O envio ocorre em duas etapas independentes. Primeiro para o cliente, enviando ofertas e o contato do vendedor. Depois para o vendedor, informando que o cliente está interessado, junto com o contato do cliente.

**Modelo (Para o Cliente):**
> Olá! Não suma mais, falei com seu vendedor para conferir nossas Ofertas!
> Segue alguns de nossos melhores preços para seu segmento!
> 
> {lista_produtos_com_imagem} 
> 
> *(O sistema deverá anexar a imagem do panfleto juntamente com a lista de produtos em texto e, em seguida, enviar o **Contato do Vendedor** de forma discreta usando a API)*

**Modelo (Para o Vendedor responsável):**
> Boa tarde! O Cliente {nome_cliente} está procurando por nossos produtos! Entre em contato com ele:
> 
> *(O sistema deverá enviar o **Contato do Cliente** logo em seguida)*
