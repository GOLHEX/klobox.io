# syntax=docker/dockerfile:1.4

# Development stage
FROM node:20-buster AS development
WORKDIR /usr/src/app
COPY package*.json ./
# Install dependencies
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN npm ci --include=dev
COPY . .
EXPOSE 3000
EXPOSE 8443
CMD ["npm", "start"]

# build stage
FROM node:20-buster AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN npm ci 
COPY . .
RUN npm run build

# production stage
FROM nginx:alpine
# Копируем нашу кастомную конфигурацию Nginx
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/
COPY --from=build /usr/src/app/build /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
# Запускаем Nginx в фоновом режиме
CMD ["nginx", "-g", "daemon off;"]
