# Подготовка данных для эксперимента 7.4 (агрегация статистики по большим журналам кликов).
#
#   .\scripts\prepare-stats.ps1                       # 20 ссылок + 5 000 000 событий
#   .\scripts\prepare-stats.ps1 -Rows 500000          # меньше строк (быстрый прогон)
#   .\scripts\prepare-stats.ps1 -Clean                # удалить прежний посев и выйти
#
# Скрипт регистрирует нагрузочную учётку (те же креды, что у sim.Auth), создаёт 20 ссылок,
# засевает по ним события клика и пишет shortener-loadtests\src\test\resources\stats.csv с
# колонками token,code. Именно эти коды потом читает StatsSimulation.
#
# Ссылки берёт по кодам, которые получил в ответах сервиса, а не «по 20 последним в базе»:
# прогоны MixedSimulation тоже создают ссылки под этой же учёткой, и запрос «20 последних»
# в перерыве между экспериментами вернул бы мусор вместо засеянных ссылок.
param(
    [int]$Links = 20,
    [int]$Rows = 5000000,
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = Split-Path -Parent $PSScriptRoot
$compose = @('-f', (Join-Path $repo 'infra\docker-compose.yml'), '--env-file', (Join-Path $repo 'infra\.env'))
$appPort = (Select-String -Path (Join-Path $repo 'infra\.env') -Pattern '^APP_PORT=(\S+)').Matches.Groups[1].Value
$base = "http://localhost:$appPort"
$csvPath = Join-Path $repo 'shortener-loadtests\src\test\resources\stats.csv'

# Маркер посева: по нему строки удаляются перед новым посевом и их видно в psql.
$marker = 'gatling-stats-seed'
$email = 'load-runner@example.com'
$password = 'load-test-secret'

function Invoke-Sql([string]$sql) {
    $sql | docker compose @compose exec -T postgres psql -U shortener -d shortener -v ON_ERROR_STOP=1 -t -A
    if ($LASTEXITCODE -ne 0) { throw "psql завершился с кодом $LASTEXITCODE" }
}

if ($Clean) {
    Write-Host "Удаляем прежний посев (user_agent = $marker)…"
    Invoke-Sql "DELETE FROM click_events WHERE user_agent = '$marker';" | Out-Null
    Invoke-Sql "ANALYZE click_events;" | Out-Null
    Write-Host "Строк в click_events осталось: $(Invoke-Sql 'SELECT count(*) FROM click_events;')"
    exit 0
}

Write-Host "Логин учётки $email на $base…"
$credentials = @{email = $email; password = $password} | ConvertTo-Json
try {
    Invoke-RestMethod -Method Post -Uri "$base/api/auth/register" -ContentType 'application/json' -Body $credentials |
        Out-Null
} catch {
    # 409 — учётка уже есть; это ожидаемый путь, вход работает и с ней.
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -ne 409) { throw }
}
$token = (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType 'application/json' -Body $credentials).accessToken
if (-not $token) { throw 'Сервис не вернул accessToken' }

Write-Host "Создаём $Links ссылок…"
$codes = @()
for ($i = 1; $i -le $Links; $i++) {
    $body = @{url = "https://example.com/stats-seed/$([guid]::NewGuid())" } | ConvertTo-Json
    $created = Invoke-RestMethod -Method Post -Uri "$base/api/links" -ContentType 'application/json' `
        -Headers @{Authorization = "Bearer $token"} -Body $body
    # Коды выдаёт сервис; без проверки формата их нельзя вставлять в SQL.
    if ($created.code -notmatch '^[0-9A-Za-z_-]{1,64}$') { throw "Неожиданный формат кода: $($created.code)" }
    $codes += $created.code
}
Write-Host "Коды: $($codes -join ', ')"

$list = ($codes | ForEach-Object { "'$_'" }) -join ', '
Write-Host "Засеваем $Rows событий клика по этим ссылкам (это самая долгая часть)…"
$started = Get-Date
Invoke-Sql @"
WITH target AS (
  SELECT array_agg(id) AS ids FROM links WHERE code IN ($list)
)
INSERT INTO click_events (link_id, clicked_at, ip_hash, user_agent, referrer)
SELECT ids[1 + (g % array_length(ids, 1))],
       now() - (random() * interval '90 days'),
       md5(g::text), '$marker', 'https://ref' || (g % 20)
FROM target, generate_series(1, $Rows) g;
"@ | Out-Null
Invoke-Sql "ANALYZE click_events;" | Out-Null
$seeded = Invoke-Sql "SELECT count(*) FROM click_events WHERE user_agent = '$marker';"
Write-Host ("Посев: {0} строк за {1:N0} с; всего в click_events {2}" -f `
    $seeded, ((Get-Date) - $started).TotalSeconds, (Invoke-Sql 'SELECT count(*) FROM click_events;'))

# Фид читается Gatling целиком, поэтому токен в каждой строке одинаков и живёт час.
# Кодировка — ascii, а не utf8: PS 5.1 дописывает к utf8 BOM, а Gatling тогда видит заголовок
# колонки как «\ufefftoken» и не находит её в #{token}.
$csv = @('token,code') + ($codes | ForEach-Object { '{0},{1}' -f $token, $_ })
Set-Content -Path $csvPath -Value $csv -Encoding ascii
Write-Host "Фид: $csvPath ($(($csv.Count - 1)) строк). Токен живёт 1 час — перед следующим прогоном перезапустите скрипт."
