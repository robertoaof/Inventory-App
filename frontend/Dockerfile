FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Vazio = a API é chamada em caminho relativo (/api/v1/...), resolvido pelo
# Caddy no mesmo domínio/porta — não faz sentido apontar para localhost:8000
# num build de produção. Ver frontend/Caddyfile.
#
# Passado só pro `RUN` abaixo (não como `ENV` persistente): esta mesma
# imagem, no estágio `build`, também é usada em dev
# (docker-compose.override.yml, `target: build` + `npm run dev`). Um `ENV`
# aqui vazaria `VITE_API_URL=""` pro processo do Vite em dev, e como o
# fallback do código é `?? "http://localhost:8000"` (só dispara em
# undefined/null, não em string vazia), isso quebrava toda chamada à API em
# dev — as requisições viravam caminho relativo e batiam no próprio Vite
# (5173) em vez do backend (8000), gerando 404.
ARG VITE_API_URL=""
RUN VITE_API_URL=$VITE_API_URL npm run build

FROM caddy:2-alpine AS production
COPY --from=build /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
