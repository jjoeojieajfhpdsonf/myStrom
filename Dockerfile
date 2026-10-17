FROM node:24-alpine
WORKDIR /app
COPY package.json server.js i18n-server.js ./
COPY public ./public
ENV NODE_ENV=production DB_PATH=/data/mystrom.db
EXPOSE 8091
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
