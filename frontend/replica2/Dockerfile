# replica2/Dockerfile   ← just update this comment
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm install -g nodemon
COPY . .
CMD ["nodemon", "--watch", ".", "index.js"]