FROM node:lts

ADD ./ ./

RUN npm run build

CMD ["node", "dist/index.js"]
