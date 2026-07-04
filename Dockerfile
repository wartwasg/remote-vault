FROM node:alpine
WORKDIR /remote
COPY ./package.json ./
RUN npm install
COPY ./ ./
CMD npm run dev
