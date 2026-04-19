# replica1/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
# nodemon for hot reload
RUN npm install -g nodemon
COPY . .
CMD ["nodemon", "--watch", "/app", "--legacy-watch", "index.js"]