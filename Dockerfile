FROM node:18
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN npm install
ENV NODE_ENV="production"
COPY . .
CMD ["npm", "start"]
