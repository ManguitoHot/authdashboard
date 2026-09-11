FROM node:20-alpine
WORKDIR /app

# better-sqlite3 compila un binding nativo en el install -> hacen falta
# herramientas de build en la imagen.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=3000
ENV DB_PATH=/app/data/telemetry.db
EXPOSE 3000

CMD ["node", "server/index.js"]
