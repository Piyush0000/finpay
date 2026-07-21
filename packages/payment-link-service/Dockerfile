FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/sdk ./packages/sdk
COPY packages/payment-link-service ./packages/payment-link-service
RUN npm install --workspace=packages/payment-link-service --workspace=packages/shared --workspace=packages/sdk
WORKDIR /app/packages/payment-link-service
CMD ["node", "src/app.js"]
