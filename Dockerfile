FROM node:12.2.0-alpine
RUN mkdir /opt/podbot && mkdir /opt/podbot/js && chown -R node:node /opt/podbot && apk update && apk add curl gcc python make musl-dev g++ ffmpeg git autoconf automake libtool

# add config required for HEROKU_EXEC
# ENV HEROKU_EXEC_DEBUG=1
RUN rm /bin/sh \
 && ln -s /bin/bash /bin/sh \
 && mkdir -p /app/.profile.d/ \
 && printf '#!/usr/bin/env bash\n\nset +o posix\n\n[ -z "$SSH_CLIENT" ] && source <(curl --fail --retry 7 -sSL "$HEROKU_EXEC_URL")\n' > /app/.profile.d/heroku-exec.sh \
 && chmod +x /app/.profile.d/heroku-exec.sh

COPY --chown=node:node index.js package.json package-lock.json /opt/podbot/
COPY --chown=node:node js /opt/podbot/js
WORKDIR /opt/podbot
RUN npm install
CMD node index.js --env-config
