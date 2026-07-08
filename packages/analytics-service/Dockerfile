FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/analytics-service ./packages/analytics-service
RUN npm install --workspace=packages/analytics-service --workspace=packages/shared
WORKDIR /app/packages/analytics-service
CMD ["node", "src/app.js"]
