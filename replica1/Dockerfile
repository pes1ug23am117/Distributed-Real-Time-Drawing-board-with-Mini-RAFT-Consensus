FROM node:20-alpine
WORKDIR /app/replica1
COPY replica1/package.json replica1/package-lock.json* ./
RUN npm install --omit=dev
COPY replica1/. .
COPY raft /app/raft
EXPOSE 3001
CMD ["node", "server.js"]