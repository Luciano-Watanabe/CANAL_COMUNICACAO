FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite precisa de --host para escutar requisições do Docker
CMD ["npm", "run", "dev", "--", "--host"]
