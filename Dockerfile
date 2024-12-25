FROM node:lts

WORKDIR /app

ADD ./ ./

RUN npm run build

RUN mkdir -p /var/cache/websurfer/sessions && chown nobody /var/cache/websurfer/sessions

VOLUME /var/cache/websurfer/sessions

USER nobody

CMD ["node", "dist/index.js"]
