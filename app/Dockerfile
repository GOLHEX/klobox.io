# syntax=docker/dockerfile:1.4

# Development stage
FROM node:20-buster AS development
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
# Install dependencies
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN yarn install --frozen-lockfile
COPY . .
EXPOSE 3000
EXPOSE 8443
CMD ["yarn", "start"]

# build stage
FROM node:20-buster AS build
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN apt-get update && \
    apt-get install -y build-essential git && \
    rm -rf /var/lib/apt/lists/*
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# production stage
FROM nginx:alpine
# Copy our custom nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
COPY default.conf /etc/nginx/conf.d/
COPY --from=build /usr/src/app/build /usr/share/nginx/html
EXPOSE 80
EXPOSE 443
# Run nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
