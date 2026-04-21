FROM node:20-slim

WORKDIR /app

COPY . .

RUN npm install && \
    npm install --prefix backend && \
    npm install --prefix extension && \
    npm run build --prefix extension

EXPOSE 5004

CMD ["npm", "run", "deploy"]
