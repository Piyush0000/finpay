FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/api-gateway ./packages/api-gateway
RUN npm install --workspace=packages/api-gateway --workspace=packages/shared
WORKDIR /app/packages/api-gateway
CMD ["node", "src/app.js"]
