FROM node:lts

WORKDIR /app

ADD ./ ./

RUN npm run build

USER nobody

VOLUME /var/cache/websurfer/sessions

CMD ["node", "dist/index.js"]
