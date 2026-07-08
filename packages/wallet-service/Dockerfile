FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/wallet-service ./packages/wallet-service
RUN npm install --workspace=packages/wallet-service --workspace=packages/shared
WORKDIR /app/packages/wallet-service
CMD ["node", "src/app.js"]
