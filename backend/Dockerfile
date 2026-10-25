FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY schema.sql ./schema.sql
EXPOSE 4000
CMD ["npm", "start"]
