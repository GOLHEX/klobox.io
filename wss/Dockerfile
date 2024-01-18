# syntax=docker/dockerfile:1.4

# Development stage
FROM node:20-buster AS development
WORKDIR /usr/src/app
COPY package.json yarn.lock ./
RUN apt-get update && \
    apt-get install -y build-essential git
RUN yarn install --frozen-lockfile
COPY . .
EXPOSE 9001-9005
CMD ["yarn", "start"]

# Build stage
FROM node:20-buster AS build
WORKDIR /usr/src/app
COPY --from=development /usr/src/app .
RUN yarn build

# Production stage
FROM node:20-buster-slim AS production
WORKDIR /usr/src/app
COPY --from=build /usr/src/app .
EXPOSE 9001-9005
CMD ["node", "wsserver.js"]
