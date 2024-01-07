# syntax=docker/dockerfile:1.4

# Development stage
FROM node:20-buster AS development
WORKDIR /usr/src/app
COPY package*.json ./
# Install dependencies
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Production stage
FROM node:20-buster AS production
WORKDIR /usr/src/app
COPY package*.json ./
# Install only production dependencies
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN npm ci --only=production
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=production /usr/src/app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
