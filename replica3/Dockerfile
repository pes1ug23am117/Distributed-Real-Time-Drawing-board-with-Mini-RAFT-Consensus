FROM node:20-alpine
WORKDIR /app/replica3
COPY replica3/package.json replica3/package-lock.json* ./
RUN npm install --omit=dev
COPY replica3/. .
COPY raft /app/raft
EXPOSE 3003
CMD ["node", "server.js"]