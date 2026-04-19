FROM node:20-alpine
WORKDIR /app/replica2
COPY replica2/package.json replica2/package-lock.json* ./
RUN npm install --omit=dev
COPY replica2/. .
COPY raft /app/raft
EXPOSE 3002
CMD ["node", "server.js"]