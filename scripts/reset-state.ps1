# Пересоздание сервиса с текущим окружением — начало каждого прогона эксперимента.
#
#   .\scripts\reset-state.ps1
#
# Вариант эксперимента задаётся переменными shell до вызова: они перекрывают infra\.env, а
# compose подставляет их в контейнер. Скрипт печатает фактические значения переключателей,
# чтобы в отчёт попадала строка «что было включено», а не «что хотелось включить».
#
#   $env:APP_CACHE_ENABLED='false'; $env:APP_CLICKS_MODE='sync'; .\scripts\reset-state.ps1
param(
    [int]$TimeoutSec = 120
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = Split-Path -Parent $PSScriptRoot
$compose = @(('-f', (Join-Path $repo 'infra\docker-compose.yml')), ('--env-file', (Join-Path $repo 'infra\.env')))
$appPort = (Select-String -Path (Join-Path $repo 'infra\.env') -Pattern '^APP_PORT=(\S+)').Matches.Groups[1].Value

# --force-recreate нужен именно здесь: без пересоздания контейнера compose не применит
# изменившиеся переменные окружения, и прогон уйдёт на прежнем варианте.
Write-Host 'Пересоздаём app с текущим окружением…'
docker compose @compose up -d --force-recreate app
if ($LASTEXITCODE -ne 0) { throw "compose up завершился с кодом $LASTEXITCODE" }

Write-Host 'Чистим Redis (кэш редиректа должен быть пустым)…'
docker compose @compose exec -T redis redis-cli FLUSHALL
if ($LASTEXITCODE -ne 0) { throw "FLUSHALL завершился с кодом $LASTEXITCODE" }

Write-Host "`nПереключатели, дошедшие до контейнера:"
$appId = (docker compose @compose ps -q app).Trim()
if (-not $appId) { throw "compose не видит контейнер app" }
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $appId |
    Select-String -Pattern '^(APP_CACHE_ENABLED|APP_CLICKS_MODE|APP_CLICKS_CONSUMER_ENABLED|SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE|SPRING_KAFKA_LISTENER_CONCURRENCY|RATE_LIMIT_CREATE_PER_MINUTE|JAVA_TOOL_OPTIONS)=' |
    ForEach-Object { "  $($_.Line)" }

Write-Host "`nЖдём health на http://localhost:$appPort/actuator/health…"
$deadline = (Get-Date).AddSeconds($TimeoutSec)
do {
    Start-Sleep -Seconds 2
    $health = curl.exe -s "http://localhost:$appPort/actuator/health"
    if ((Get-Date) -gt $deadline) { throw "сервис не стал UP за $TimeoutSec с: $health" }
} until ($health -match '"UP"')
Write-Host "Сервис UP: $health"
