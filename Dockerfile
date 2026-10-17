FROM node:20-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
ENV NODE_ENV=production
ENV ADMIN_PASSWORD=joel
EXPOSE 3000
RUN node tests/run_all.js
CMD ["node", "server.js"]
