FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/notification-service ./packages/notification-service
RUN npm install --workspace=packages/notification-service --workspace=packages/shared
WORKDIR /app/packages/notification-service
CMD ["node", "src/subscriber.js"]
