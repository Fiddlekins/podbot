FROM node:12.2.0-alpine
RUN mkdir /opt/podbot && mkdir /opt/podbot/js && chown -R node:node /opt/podbot && apk update && apk add gcc python make musl-dev g++ ffmpeg git autoconf automake libtool
COPY --chown=node:node index.js package.json package-lock.json /opt/podbot/
COPY --chown=node:node js /opt/podbot/js
WORKDIR /opt/podbot
USER node
RUN npm install
CMD node index.js --env-config
