<#
.SYNOPSIS
    Roda `alembic upgrade head` e depois `python -m app.seed_items` contra o
    banco do Supabase, na ordem obrigatoria (migracao antes do seed).

.DESCRIPTION
    A senha do banco NUNCA e digitada na linha de comando nem passa por chat:
    o script le a URL de conexao de um arquivo local, fora do git.

    Antes de rodar pela primeira vez, crie `backend/.env.supabase` (ignorado
    pelo git) com UMA linha, usando o *session pooler* (porta 5432):

        DATABASE_URL=postgresql+psycopg://postgres.<ref>:<SENHA>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres

    O prefixo `postgresql+psycopg://` e obrigatorio (o painel do Supabase
    mostra `postgresql://`, que o SQLAlchemy nao aceita aqui).

.PARAMETER Arquivo
    Caminho do arquivo de onde ler a linha `DATABASE_URL=`. Padrao:
    `backend/.env.supabase`. Use `-Arquivo .env` se voce preferir manter a
    URL do Supabase no `.env` da raiz — mas lembre que esse mesmo arquivo e
    o que o `docker compose` le, entao o ambiente local passa a apontar para
    o Supabase enquanto a linha estiver la.

.PARAMETER SomenteMigracao
    Roda so o `alembic upgrade head`, sem o seed. Util para migracoes
    futuras num banco que ja tem o catalogo populado (secao 8.2 do roteiro
    `docs/deploy-vercel-supabase.md`).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/migrar-supabase.ps1
#>
param(
    [string]$Arquivo,
    [switch]$SomenteMigracao
)

$ErrorActionPreference = "Stop"

$raiz     = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $raiz "backend"
if ($Arquivo) {
    $arquivo = if ([System.IO.Path]::IsPathRooted($Arquivo)) { $Arquivo } else { Join-Path $raiz $Arquivo }
} else {
    $arquivo = Join-Path $backend ".env.supabase"
}
$python   = Join-Path $backend ".venv\Scripts\python.exe"

if (-not (Test-Path $arquivo)) {
    Write-Host "ERRO: nao encontrei $arquivo" -ForegroundColor Red
    Write-Host "Crie o arquivo com uma linha DATABASE_URL=... (session pooler, porta 5432)."
    Write-Host "Veja o cabecalho deste script ou a secao 2.5 de docs/deploy-vercel-supabase.md."
    exit 1
}

if (-not (Test-Path $python)) {
    Write-Host "ERRO: venv do backend nao encontrado em $python" -ForegroundColor Red
    Write-Host "Crie com:  cd backend; py -m venv .venv; .venv\Scripts\python.exe -m pip install -r requirements.txt"
    exit 1
}

# Le so a linha DATABASE_URL, ignorando comentarios e linhas em branco.
$linha = Get-Content $arquivo | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $linha) {
    Write-Host "ERRO: $arquivo nao tem uma linha DATABASE_URL=..." -ForegroundColor Red
    exit 1
}
$url = ($linha -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")

if ($url -notmatch '^postgresql\+psycopg://') {
    Write-Host "ERRO: a URL precisa comecar com postgresql+psycopg:// (e nao postgresql://)." -ForegroundColor Red
    exit 1
}
if ($url -match ':6543/') {
    Write-Host "ERRO: essa e a URL do transaction pooler (6543), que e a da Vercel." -ForegroundColor Red
    Write-Host "Para migracao use o session pooler, porta 5432."
    exit 1
}

# Mascara a senha em qualquer saida (mensagem de erro do driver, por ex.).
$senha = $null
if ($url -match '://[^:/@]+:([^@]+)@') { $senha = $Matches[1] }
function Escrever($texto) {
    $linha = [string]$texto
    if ($senha -and $linha) { $linha = $linha.Replace($senha, '***') }
    Write-Host $linha
}

# `$ErrorActionPreference = "Stop"` faria o PowerShell 5.1 tratar cada linha
# de stderr de um .exe como erro terminante (NativeCommandError), enchendo a
# tela de ruido. O sucesso e conferido pelo $LASTEXITCODE logo abaixo.
function RodarPython([string[]]$argumentos) {
    $anterior = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $python @argumentos 2>&1 | ForEach-Object { Escrever $_ }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $anterior
    }
}

$env:DATABASE_URL = $url
Push-Location $backend
try {
    Escrever "==> alembic upgrade head"
    $codigo = RodarPython @("-m", "alembic", "upgrade", "head")
    if ($codigo -ne 0) { Escrever "FALHOU na migracao (codigo $codigo). O seed NAO foi rodado."; exit $codigo }

    if ($SomenteMigracao) {
        Escrever "==> seed pulado (-SomenteMigracao)"
    } else {
        Escrever "==> python -m app.seed_items"
        $codigo = RodarPython @("-m", "app.seed_items")
        if ($codigo -ne 0) { Escrever "FALHOU no seed (codigo $codigo)."; exit $codigo }
    }
    Escrever "==> OK"
} finally {
    Pop-Location
    Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
}
