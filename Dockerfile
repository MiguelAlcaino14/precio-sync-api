FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
EXPOSE 3001
CMD ["sh", "-c", "until npx prisma db push; do echo 'DB no disponible, reintentando en 5s...'; sleep 5; done && node prisma/seed.js && node src/index.js"]
