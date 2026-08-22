FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY . .

# Cloud Run will supply PORT=8080 automatically
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "index.js"]
