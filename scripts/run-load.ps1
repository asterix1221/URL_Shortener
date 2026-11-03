# Запуск нагрузочной симуляции Gatling.
#
#   .\scripts\run-load.ps1 -Sim Redirect -Profile constant -Rps 50 -Duration 120
#
# Параметры передаются симуляции переменными окружения (не -D): gatling-maven-plugin поднимает
# свою JVM, и system-свойства до неё доходят не всегда. Адрес сервиса по умолчанию берётся из
# infra\.env — в локальном стенде наружный порт не обязательно 8080.
param(
    [Parameter(Mandatory = $true)][string]$Sim,
    [ValidateSet('constant', 'ramp', 'spike')][string]$Profile = 'constant',
    [int]$Rps = 50,
    [int]$Duration = 120,
    [int]$RpsFrom = 10,
    [int]$RpsTo = 200,
    [string]$BaseUrl = ''
)

$ErrorActionPreference = 'Stop'
# Кириллица в логах пайплайна: без этого перенаправление вывода в файл теряет кодировку.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repo = Split-Path -Parent $PSScriptRoot
$module = Join-Path $repo 'shortener-loadtests'
$gatlingReports = Join-Path $module 'target\gatling'

if (-not $BaseUrl) {
    $appPort = (Select-String -Path (Join-Path $repo 'infra\.env') -Pattern '^APP_PORT=(\S+)').Matches.Groups[1].Value
    $BaseUrl = "http://localhost:$appPort"
}

# -Sim Redirect и -Sim RedirectSimulation означают одно и то же.
$simulationClass = if ($Sim -match 'Simulation$') { $Sim } else { "${Sim}Simulation" }
$simulationClass = "sim.$simulationClass"

# Предупреждение про лимит нужно только симуляциям, которые создают ссылки: у StatsSimulation и
# RedirectSimulation доля создания равна нулю, и проверка на 1000/мин для них — ложный шум.
if ($simulationClass -in @('sim.MixedSimulation', 'sim.CreateSimulation')) {
    $limitLine = Select-String -Path (Join-Path $repo 'infra\.env') -Pattern '^RATE_LIMIT_CREATE_PER_MINUTE=(\d+)'
    if ($limitLine) {
        $limit = [int]$limitLine.Matches.Groups[1].Value
        # Доля запросов на создание ссылок: в смешанном сценарии это 5% общей нагрузки.
        $createShare = switch ($simulationClass) {
            'sim.MixedSimulation' { 0.05 }
            'sim.CreateSimulation' { 1 }
            default { 0 }
        }
        # Пиковая интенсивность прогона: spike даёт десятикратный пик, ramp — верхнюю границу.
        $peak = [math]::Max($Rps, [math]::Max($RpsFrom, $RpsTo))
        if ($Profile -eq 'spike') { $peak *= 10 }
        $neededPerMinute = [math]::Ceiling($peak * $createShare * 60)
        if ($limit -lt $neededPerMinute) {
            Write-Warning "RATE_LIMIT_CREATE_PER_MINUTE=$limit, а прогону нужно около $neededPerMinute/мин: часть запросов получит 429."
            Write-Warning "Подними значение в infra\.env и пересоздай контейнер app, затем повтори прогон."
        }
    }
}

$env:BASE_URL = $BaseUrl
$env:PROFILE = $Profile
$env:RPS = "$Rps"
$env:RPS_FROM = "$RpsFrom"
$env:RPS_TO = "$RpsTo"
$env:DURATION_SEC = "$Duration"

Write-Host "Симуляция : $simulationClass"
Write-Host "Профиль   : $Profile (RPS=$Rps, from=$RpsFrom, to=$RpsTo, duration=${Duration}s)"
Write-Host "Сервис    : $BaseUrl"

Push-Location $module
try {
    # Отдельная JVM наследует переменные окружения этого процесса.
    & .\mvnw.cmd -B gatling:test "-Dgatling.simulationClass=$simulationClass"
    $exit = $LASTEXITCODE
} finally {
    Pop-Location
}

$latest = Get-ChildItem $gatlingReports -Directory -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime |
    Select-Object -Last 1
if ($latest) {
    Write-Host "Отчёт     : $(Join-Path $latest.FullName 'index.html')"
} else {
    Write-Host "Отчёт не найден в $gatlingReports (прогон не стартовал?)"
}

exit $exit
