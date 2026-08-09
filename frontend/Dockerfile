FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Vazio = a API é chamada em caminho relativo (/api/v1/...), resolvido pelo
# Caddy no mesmo domínio/porta — não faz sentido apontar para localhost:8000
# num build de produção. Ver frontend/Caddyfile.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM caddy:2-alpine AS production
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
