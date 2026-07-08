FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/transaction-service ./packages/transaction-service
RUN npm install --workspace=packages/transaction-service --workspace=packages/shared
WORKDIR /app/packages/transaction-service
CMD ["node", "src/app.js"]
