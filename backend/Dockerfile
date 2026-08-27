FROM node:20-slim

WORKDIR /app

# Instalar dependências para o Oracle Instant Client (Thick mode) e utilitários
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    unzip \
    libaio1 \
    curl \
    iptables \
    ca-certificates \
    gnupg \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.noarmor.gpg | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null \
    && curl -fsSL https://pkgs.tailscale.com/stable/debian/bookworm.tailscale-keyring.list | tee /etc/apt/sources.list.d/tailscale.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends tailscale \
    && rm -rf /var/lib/apt/lists/*

# Baixar e extrair Oracle Instant Client (Basic Lite 19c)
RUN wget --no-check-certificate https://download.oracle.com/otn_software/linux/instantclient/1921000/instantclient-basiclite-linux.x64-19.21.0.0.0dbru.zip -O /tmp/instantclient.zip \
    && unzip /tmp/instantclient.zip -d /opt/oracle \
    && rm /tmp/instantclient.zip \
    && sh -c "echo /opt/oracle/instantclient_19_21 > /etc/ld.so.conf.d/oracle-instantclient.conf" \
    && ldconfig

ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_19_21:$LD_LIBRARY_PATH

COPY package*.json ./
RUN npm install

COPY . .
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 3001
CMD ["./start.sh"]
