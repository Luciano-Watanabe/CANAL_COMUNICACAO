# Guia de Instalação e Deploy (Docker)

Este documento descreve os passos necessários para configurar e iniciar o ambiente do Canal de Comunicação em Homologação/Produção utilizando Docker.

## Pré-requisitos
*   **Docker** e **Docker Compose** instalados no servidor/máquina hospedeira.
*   Conexão de rede que permita acesso ao banco de dados Oracle (Winthor).

## Passo a Passo

### 1. Preparação do Ambiente
Clone o repositório ou copie os arquivos do projeto para o diretório desejado na máquina hospedeira.
```bash
git clone <url-do-repositorio>
cd CANAL_COMUNICACAO
```

### 2. Configuração de Variáveis (Arquivo `.env`)
No diretório raiz do projeto, existe um arquivo chamado `.env.example`. Você deve utilizá-lo como base para criar o seu `.env` com as credenciais reais.
```bash
cp .env.example .env
```
Edite o arquivo `.env` preenchendo as seguintes chaves essenciais:
*   `ORACLE_USER`, `ORACLE_PASS`, `ORACLE_CONN_STR`: Credenciais do banco Winthor.
*   `GROQ_API_KEY`: Chave de API para a transcrição de áudios via Inteligência Artificial.
*   `HOST_IMAGES_DIR`: Caminho na máquina host onde ficam as fotos dos produtos.

### 3. Build e Subida dos Containers
O sistema é composto por 4 containers (Banco Local, Backend API, Backend Worker e Frontend). O arquivo `docker-compose.yml` orquestra tudo.
Para baixar dependências, construir as imagens e subir o sistema em segundo plano, rode:
```bash
docker compose up --build -d
```
> **Nota para usuários Windows:** Se você estiver utilizando Docker Desktop no Windows, lembre-se de que alterações nos arquivos locais às vezes exigem que você rode um build ignorando o cache, caso os volumes falhem em atualizar o container em tempo real. Veja a seção de Troubleshooting no `README.md`.

### 4. Acesso ao Sistema
Após a subida, o sistema estará operante:
*   **Frontend (Interface do Usuário):** `https://localhost:3002` (ou o IP/Domínio configurado).
*   **Backend API:** Responde na porta interna `3001`.

### 5. Checagem de Logs (Opcional)
Para acompanhar a saúde do sistema ou investigar o fluxo de mensagens e crons:
```bash
# Ver todos os logs (Frontend e Backend)
docker compose logs -f

# Ver apenas logs dos Crons e processamento de Webhooks
docker compose logs -f worker
```
