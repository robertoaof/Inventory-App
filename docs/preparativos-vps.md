# Preparativos para deploy numa VPS (Hostinger) — Sistema de Inventário Scania

Este documento é um roteiro passo a passo para colocar o sistema no ar
numa VPS, escrito para quem **nunca trabalhou com uma VPS antes**. Ele
assume a decisão já tomada em `docs/docker-compose.md` (seção 5): hospedar
numa VPS própria, rodando o `docker-compose.prod.yml` que já existe e foi
testado no repositório.

Se em algum momento você ficar em dúvida sobre um comando, pare e pergunte
antes de rodar — comandos de servidor são mais difíceis de desfazer que
comandos no seu computador.

---

## 0. O que é uma VPS, em uma frase

Uma VPS ("Virtual Private Server") é um computador remoto, ligado 24h, que
você acessa por um terminal (nunca por mouse/tela) e no qual você é
responsável por tudo que roda nele — diferente de uma hospedagem
compartilhada, onde o provedor já configura o ambiente pra você. A
vantagem é controle total (é exatamente o que este sistema precisa, com
seus três serviços Docker); a contrapartida é que segurança básica
(senhas, firewall, atualizações) também é sua responsabilidade.

---

## 1. Contratando a VPS na Hostinger

- **Plano:** o menor plano de VPS da Hostinger já é suficiente para este
  sistema (não é uma aplicação com tráfego alto) — comece pelo mais barato
  e suba de plano só se sentir necessidade depois.
- **Sistema operacional:** escolha **Ubuntu** (22.04 ou mais recente) na
  hora de criar a VPS. É o sistema mais comum para isso, com a
  documentação mais fácil de encontrar quando algo der errado.
- **Imagem com Docker pré-instalado:** a Hostinger costuma oferecer um
  "template"/"imagem de aplicação" já com Docker instalado (procure por
  "Docker" na lista de sistemas operacionais/aplicações ao criar a VPS).
  Se existir essa opção, escolha-a — pula o passo 4 (instalar Docker à
  mão). Se não encontrar, sem problema, o passo 4 cobre a instalação
  manual.
- Ao final da contratação, a Hostinger te dá: um **endereço IP** (algo
  como `123.45.67.89`) e uma **senha de root** (ou a opção de configurar
  uma chave SSH direto no painel — se essa opção existir, prefira-a em vez
  de senha, é mais segura e o passo 2 explica como gerar uma).

---

## 2. Primeiro acesso (SSH)

SSH é o "terminal remoto" — o jeito de digitar comandos na VPS a partir do
seu computador.

### 2.1 Gerar uma chave SSH (recomendado, mais seguro que senha)

No seu computador (não na VPS), abra um terminal e rode:

```bash
ssh-keygen -t ed25519 -C "seu-email@exemplo.com"
```

Aceite o caminho padrão (Enter) e, se quiser, defina uma senha para a
própria chave (opcional). Isso cria dois arquivos: uma chave privada
(fica só no seu computador, nunca compartilhe) e uma pública (`.pub`, essa
pode ir para a VPS). Se a Hostinger permitiu colar a chave pública no
painel na hora de criar a VPS, cole o conteúdo do arquivo `.pub` lá. Se
não, você pode copiá-la depois de acessar a VPS (passo 2.2 explica como
usando senha primeiro).

### 2.2 Conectar pela primeira vez

```bash
ssh root@SEU_IP_AQUI
```

Na primeira conexão, o terminal vai perguntar se confia no servidor —
digite `yes`. Se estiver usando senha, ela foi mandada pela Hostinger
(painel ou e-mail).

### 2.3 Trocar a senha padrão (se você recebeu uma)

```bash
passwd
```

Escolha uma senha forte, mesmo que você pretenda usar só chave SSH depois
— é uma segunda camada de proteção.

### 2.4 Criar um usuário não-root para o dia a dia

Trabalhar sempre como `root` é arriscado (um comando digitado errado pode
derrubar o servidor inteiro sem pedir confirmação). Crie um usuário comum:

```bash
adduser invcontra
usermod -aG sudo invcontra
usermod -aG docker invcontra
```

(O último comando só funciona depois que o Docker estiver instalado —
passo 4. Pode rodar de novo depois, sem problema.)

A partir daqui, prefira conectar como `ssh invcontra@SEU_IP_AQUI` em vez de
`root`, usando `sudo` quando precisar de permissão de administrador.

---

## 3. Firewall básico

Por padrão, uma VPS nova aceita conexão em qualquer porta. Isso é
perigoso: o Postgres (porta `5432`) e o backend (porta `8000`), por
exemplo, **nunca devem estar abertos para a internet inteira** — só o
`frontend` (portas `80`/`443`, quando o HTTPS estiver configurado) e o SSH
(`22`) precisam.

Ubuntu já vem com o `ufw` (firewall simples). Configure assim:

```bash
sudo ufw allow 22/tcp    # SSH — sem isso você se tranca pra fora da VPS
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS (seção 7)
sudo ufw enable
```

Confirme com `sudo ufw status` — deve mostrar só essas três portas como
`ALLOW`. Note que `5432` (Postgres) e `8000` (backend) **não** entram
nessa lista de propósito: eles só precisam ser alcançáveis *entre os
containers*, pela rede interna do Docker, nunca diretamente pela internet.

---

## 4. Instalar Docker (pule se já usou o template com Docker da Hostinger)

Comandos oficiais do Docker para Ubuntu (rode como `invcontra`, com
`sudo`):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Depois desse último comando, **saia e entre de novo no SSH**
(`exit`, depois `ssh invcontra@SEU_IP_AQUI`) para a permissão de grupo
valer. Teste com:

```bash
docker --version
docker compose version
```

Se os dois comandos responderem com um número de versão, está pronto.

---

## 5. Domínio (opcional, mas recomendado)

Você pode acessar o sistema só pelo IP (`http://123.45.67.89`), mas um
domínio (`http://inventario.suaempresa.com.br`, por exemplo) é mais fácil
de lembrar e é **pré-requisito para HTTPS** (seção 7 — os certificados
gratuitos do Let's Encrypt são emitidos para domínios, não para IPs).

Se você já tem um domínio (comprado na própria Hostinger ou em outro
lugar), configure um registro **A** apontando para o IP da VPS. Isso é
feito no painel de DNS de onde o domínio foi comprado — procure por "DNS"
ou "Zona DNS" e crie/edite um registro:

| Tipo | Nome | Valor |
|---|---|---|
| A | `inventario` (ou `@` para o domínio raiz) | `SEU_IP_AQUI` |

A propagação pode levar de alguns minutos a algumas horas. Para testar se
já propagou: `ping inventario.suaempresa.com.br` deve responder com o IP
da VPS.

---

## 6. Colocar o código na VPS

### 6.1 Instalar o Git (geralmente já vem no Ubuntu, mas por garantia)

```bash
sudo apt update && sudo apt install -y git
```

### 6.2 Clonar o repositório

```bash
git clone https://github.com/robertoaof/Inventory-App.git invcontra
cd invcontra
```

### 6.3 Criar o `.env` de produção

O `.env` **nunca é versionado no Git** (está no `.gitignore` de propósito
— evita vazar senha/credencial). Ele precisa ser criado direto na VPS:

```bash
cp .env.example .env
nano .env
```

(`nano` é um editor de texto simples de terminal — `Ctrl+O` salva,
`Ctrl+X` sai.) Preencha com valores **reais e diferentes dos de
desenvolvimento**, principalmente:

- `POSTGRES_PASSWORD` — uma senha forte, gerada só para produção (nunca
  reaproveite a senha que você usou no seu computador).
- `CORS_ORIGINS` — o endereço real onde o frontend vai ficar, por exemplo
  `https://inventario.suaempresa.com.br` (sem domínio ainda, use
  `http://SEU_IP_AQUI`, mas troque assim que tiver o domínio/HTTPS
  prontos, seção 7).

---

## 7. HTTPS — implementado com Caddy (decidido em 2026-08-09)

O `frontend/Dockerfile` builda o React e serve o resultado com
**Caddy** (`frontend/Caddyfile`), em vez de Nginx puro. Caddy tem dois
papéis no mesmo container: serve os arquivos estáticos do React e
faz proxy reverso de `/api/*` para o `backend` (rede interna do Docker,
`backend:8000` — essa porta não fica mais publicada no host em produção,
só o `frontend` fala com ela). Como frontend e API ficam na mesma origem,
o navegador nunca faz uma requisição cross-origin em produção (CORS deixa
de ser relevante nesse cenário, embora `CORS_ORIGINS` continue existindo
para o ambiente de desenvolvimento, onde o Vite roda numa porta diferente
do backend).

O comportamento depende só da variável `DOMAIN` no `.env`:

- **`DOMAIN` vazio (padrão do `.env.example`):** Caddy serve HTTP puro na
  porta `80`, sem tentar emitir certificado — é o modo certo pra testar
  pelo IP (`http://SEU_IP_AQUI`), antes de ter um domínio configurado
  (seção 5).
- **`DOMAIN=inventario.suaempresa.com.br`:** depois que o DNS estiver
  propagado (seção 5) e as portas `80`/`443` estiverem liberadas no
  firewall (seção 3), basta preencher `DOMAIN` no `.env` e subir de novo
  (`docker compose ... up -d --build`) — o Caddy pede e renova o
  certificado Let's Encrypt sozinho, sem nenhum passo manual de
  `certbot`/cron. Preencher também `ACME_EMAIL` é opcional, mas recomendado
  (o Let's Encrypt usa esse endereço só para avisar sobre expiração, o que
  na prática nunca deveria acontecer já que a renovação é automática).

Os certificados ficam no volume nomeado `caddy_data` (persistente entre
`up`/`down` e rebuilds — importante: sem esse volume, cada rebuild pediria
certificado novo e esbarraria no rate limit do Let's Encrypt).

**Verificado em 2026-08-09** subindo a stack de produção completa
localmente (`docker compose -f docker-compose.yml -f
docker-compose.prod.yml up -d --build`, sem `DOMAIN` definido): frontend
respondeu `200` em `http://localhost:80/`, `GET /api/v1/health` através do
proxy respondeu `{"status":"ok"}`, e as portas `8000` (backend) e `5432`
(db) confirmadas como **não** alcançáveis do host — só o `frontend`
(Caddy) fica exposto, como a seção 3 já exigia. Ambiente devolvido ao
estado de desenvolvimento ao final.

---

## 8. Subir o sistema

Com o `.env` preenchido e (idealmente) o HTTPS resolvido:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Isso builda as imagens, roda a migração do banco + o seed do catálogo
(serviço `migrate`, que sai sozinho depois), sobe `db`, `backend`,
`frontend` e `backup` com `restart: unless-stopped` (voltam sozinhos se a
VPS reiniciar).

Acompanhe a subida com:

```bash
docker compose ps
docker compose logs -f
```

(`Ctrl+C` sai do modo de acompanhamento sem derrubar os serviços.)

---

## 9. Testar

- No navegador do seu computador (não da VPS): acesse `http://SEU_IP_AQUI`
  (ou `https://seu-dominio` depois do passo 7) — a tela de Contagem deve
  aparecer com os 11 itens do catálogo.
- Pelo terminal da própria VPS, um teste rápido da API:
  ```bash
  curl http://localhost:8000/api/v1/health
  ```
  Deve responder `{"status":"ok"}`.

---

## 10. Backups

Já vêm prontos, sem nenhum passo extra: o serviço `backup` (subido junto
no passo 8) roda um `pg_dump` diário e apaga automaticamente qualquer
arquivo com mais de 7 dias (`docs/docker-compose.md` seção 2.1 tem o
detalhe completo, incluindo o comando de restauração). Vale só conferir de
vez em quando que o disco da VPS não está enchendo — o plano de VPS mais
barato tem pouco espaço, e três serviços Docker + backups acumulados podem
disputar espaço com o tempo. Um lembrete futuro (não resolvido ainda):
esses backups hoje ficam só na própria VPS — se ela for perdida
inteira (falha de disco, conta suspensa, etc.), o backup vai junto. Copiar
os backups para fora da VPS (outro provedor de armazenamento) é o próximo
passo de segurança, ainda não decidido.

---

## 11. Atualizando o sistema depois do primeiro deploy

Sempre que houver uma mudança nova no repositório para colocar no ar:

```bash
cd invcontra
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

O `migrate` roda de novo automaticamente antes do `backend` subir — se
houver uma migração nova do Alembic, ela é aplicada nesse momento. Os
dados do banco não são perdidos (ficam no volume `db_data`, fora do ciclo
de vida dos containers).

---

## 12. Checklist final antes de considerar "em produção"

- [ ] Consegue acessar a VPS por SSH com o usuário não-root (`invcontra`),
      não mais como `root`.
- [ ] `sudo ufw status` mostra só `22`, `80` e `443` liberados.
- [ ] `.env` da VPS tem senha do Postgres **diferente** da usada em
      desenvolvimento.
- [ ] `CORS_ORIGINS` no `.env` aponta para o endereço real (domínio ou IP)
      onde o frontend está sendo acessado.
- [ ] `DOMAIN` preenchido no `.env` da VPS e HTTPS confirmado no navegador
      (cadeado, `https://`) — seção 7. Sem domínio ainda, ao menos rodando
      em HTTP (o Caddy cobre isso automaticamente); não deveria ficar sem
      domínio/HTTPS por muito tempo, mesmo sendo um sistema interno.
- [ ] Testado no navegador: abrir o sistema, editar um óleo, importar um
      XML pequeno de teste, fechar um dia, e apagar esse dado de teste do
      banco ao final (mesma rotina usada durante o desenvolvimento).
- [ ] Confirmado que `docker compose ps` mostra os serviços com
      `restart: unless-stopped` — teste reiniciando a VPS (`sudo reboot`,
      espera alguns minutos, reconecta por SSH) e conferindo que tudo
      volta sozinho.

---

## Pontos em aberto deste documento

- **Cópia externa do backup** (seção 10) — mesmo ponto já registrado em
  `docs/docker-compose.md` seção 2.1/8, depende da hospedagem final.
- **Deploy automatizado** (seção 11 hoje é manual, `git pull` + rebuild na
  mão) — um pipeline de CI/CD (GitHub Actions rodando o deploy sozinho a
  cada push) não foi discutido ainda; pode valer a pena quando o ritmo de
  mudanças justificar.
