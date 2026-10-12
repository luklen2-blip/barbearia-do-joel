FROM node:20-alpine
WORKDIR /usr/src/app
COPY . .
ENV PORT=3000
ENV NODE_ENV=production
EXPOSE 3000
RUN node tests/run_all.js
CMD ["node", "server.js"]
