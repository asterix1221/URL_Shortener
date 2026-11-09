param(
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"
$base = $BaseUrl

$email = "u$(Get-Random)@example.com"
$cred = @{ email = $email; password = "Passw0rd!" } | ConvertTo-Json

Invoke-RestMethod -Method Post "$base/api/auth/register" -ContentType 'application/json' -Body $cred | Out-Null
$tok = (Invoke-RestMethod -Method Post "$base/api/auth/login" -ContentType 'application/json' -Body $cred).accessToken
$h = @{ Authorization = "Bearer $tok" }

# без токена -> 401
Invoke-RestMethod -Method Post "$base/api/links" -ContentType 'application/json' `
    -Body (@{ url = "https://example.com" } | ConvertTo-Json) -SkipHttpErrorCheck -StatusCodeVariable sc | Out-Null
"no token: $sc (ожидаем 401)"
if ($sc -ne 401) { throw "Без токена пришли код $sc, ждали 401" }

# с токеном -> 201
$link = Invoke-RestMethod -Method Post "$base/api/links" -Headers $h -ContentType 'application/json' `
    -Body (@{ url = "https://example.com"; maxClicks = 2 } | ConvertTo-Json)
"created: $($link.code) -> $($link.shortUrl)"

# переходы: 302 302 410 (лимит в 2 клика исчерпывается атомарным UPDATE)
$codes = 1..3 | ForEach-Object { curl.exe -s -o NUL -w "%{http_code}" "$base/$($link.code)" }
"redirects: $($codes -join ' ')"
if (($codes -join ' ') -ne '302 302 410') { throw "Переходы дали '$($codes -join ' ')', ждали '302 302 410'" }

# события кликов пишутся через Kafka, поэтому статистика догоняет редиректы, а не опережает их
$stats = $null
for ($i = 1; $i -le 20; $i++) {
    $stats = Invoke-RestMethod "$base/api/links/$($link.code)/stats" -Headers $h
    if ($stats.totalClicks -ge 2) { break }
    Start-Sleep -Seconds 1
}
if ($stats.totalClicks -lt 2) { throw "Клики не дошли до статистики за 20 с: totalClicks=$($stats.totalClicks)" }
"stats: totalClicks=$($stats.totalClicks) (появились на $i-й секунде)"
$stats | ConvertTo-Json -Depth 5

# интерфейс: отдаёт gateway, а не приложение; ловит «nginx не нашёл dist» там же, где API-часть
# ловит поломавшийся сервис
$app = Invoke-WebRequest "$base/app/" -SkipHttpErrorCheck
if ($app.StatusCode -ne 200 -or "$($app.Headers['Content-Type'])" -notmatch 'text/html') {
    throw "GET /app/ вернул $($app.StatusCode) с Content-Type '$($app.Headers['Content-Type'])', ждали 200 text/html"
}
if (-not $app.Headers['Content-Security-Policy']) { throw "У /app/ нет Content-Security-Policy" }

$index = Invoke-WebRequest "$base/app/index.html" -SkipHttpErrorCheck
if ($index.StatusCode -ne 200 -or "$($index.Headers['Cache-Control'])" -notmatch 'no-store') {
    throw "GET /app/index.html вернул $($index.StatusCode) с Cache-Control '$($index.Headers['Cache-Control'])', ждали 200 no-store"
}

# путь берём из самого HTML, а не из каталога: имя файла содержит хэш сборки
$asset = [regex]::Match($app.Content, '/app/assets/[A-Za-z0-9._-]+\.js').Value
if (-not $asset) { throw "В /app/ не найден путь к /app/assets/*.js — бандл не на месте" }
$js = Invoke-WebRequest "$base$asset" -SkipHttpErrorCheck
if ($js.StatusCode -ne 200 -or "$($js.Headers['Cache-Control'])" -notmatch 'immutable') {
    throw "$asset вернул $($js.StatusCode) с Cache-Control '$($js.Headers['Cache-Control'])', ждали 200 immutable"
}

# корень больше не принадлежит приложению
# -MaximumRedirection 0 в PS 7 пишет ошибку «maximum redirection count has been exceeded» даже
# с -SkipHttpErrorCheck (тот снимает только 4xx/5xx), а с ErrorActionPreference=Stop она валит
# скрипт. -ErrorAction SilentlyContinue гасит именно эту запись и возвращает сам ответ: 302 и
# Location проверяются ниже как раньше. Обрыв связи не прячется — на $null упадёт проверка.
$root = Invoke-WebRequest "$base/" -MaximumRedirection 0 -SkipHttpErrorCheck -ErrorAction SilentlyContinue
if ($root.StatusCode -ne 302 -or "$($root.Headers.Location)" -ne '/app/') {
    throw "GET / вернул $($root.StatusCode) с Location '$($root.Headers.Location)', ждали 302 /app/"
}

# адрес входа без завершающего слэша: иначе он уезжает в API как зарезервированный код `app`
$appBare = Invoke-WebRequest "$base/app" -MaximumRedirection 0 -SkipHttpErrorCheck -ErrorAction SilentlyContinue
if ($appBare.StatusCode -ne 302 -or "$($appBare.Headers.Location)" -ne '/app/') {
    throw "GET /app вернул $($appBare.StatusCode) с Location '$($appBare.Headers.Location)', ждали 302 /app/"
}
"UI: /app/ 200 text/html, index no-store, $asset immutable, / и /app -> 302 /app/"
