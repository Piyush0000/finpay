FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/auth-service ./packages/auth-service
RUN npm install --workspace=packages/auth-service --workspace=packages/shared
WORKDIR /app/packages/auth-service
CMD ["node", "src/app.js"]
