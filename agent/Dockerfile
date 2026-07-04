FROM node:alpine
WORKDIR /agent
COPY ./package.json ./
RUN npm install
COPY ./ ./
CMD npm run dev
