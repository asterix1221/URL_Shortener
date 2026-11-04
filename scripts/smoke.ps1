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
