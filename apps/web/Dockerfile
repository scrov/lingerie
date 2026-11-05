# Storefront SSR server, run as a Cloudflare Container behind the front Worker (worker/index.ts).
#
# Build `ng build` first: the image only packages dist/server, which already bundles every
# dependency. Static files (dist/browser) are served by the Worker, not by this container.
# `wrangler deploy` builds this image for linux/amd64 and pushes it to Cloudflare's registry.

FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app
COPY --chown=node:node dist/server ./server

USER node
EXPOSE 8080
CMD ["node", "server/server.mjs"]
