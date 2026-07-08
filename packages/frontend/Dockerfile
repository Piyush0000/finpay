FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/frontend ./packages/frontend
RUN npm install --workspace=packages/frontend
WORKDIR /app/packages/frontend
EXPOSE 5173
CMD ["npm", "run", "dev"]
