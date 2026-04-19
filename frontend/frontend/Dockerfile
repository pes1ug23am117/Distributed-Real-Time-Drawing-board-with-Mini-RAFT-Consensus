FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install -g serve
RUN chmod +x /app/entrypoint.sh
CMD ["/app/entrypoint.sh"]