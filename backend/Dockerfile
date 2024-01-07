# syntax=docker/dockerfile:1.4

# Development stage
FROM node:20-buster AS development
WORKDIR /usr/src/app
COPY package*.json ./
RUN apt-get update && \
    apt-get install -y build-essential git
RUN npm ci
COPY . .
EXPOSE 9001
CMD ["npm", "start"]

# Build stage
FROM node:20-buster AS build
WORKDIR /usr/src/app
COPY --from=development /usr/src/app .
RUN npm run build

# Production stage
FROM node:20-buster-slim
WORKDIR /usr/src/app
COPY --from=build /usr/src/app .
EXPOSE 9001
CMD ["node", "wsserver.js"]
