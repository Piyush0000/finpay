FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/payment-worker ./packages/payment-worker
RUN npm install --workspace=packages/payment-worker --workspace=packages/shared
WORKDIR /app/packages/payment-worker
CMD ["node", "src/worker.js"]
