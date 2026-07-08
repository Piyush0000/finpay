FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/shared ./packages/shared
COPY packages/bull-board ./packages/bull-board
RUN npm install --workspace=packages/bull-board --workspace=packages/shared
WORKDIR /app/packages/bull-board
EXPOSE 3010
CMD ["node", "src/app.js"]
