# Доставка SPA и маршрут запроса через шлюз

Диаграмма показывает, как gateway nginx раздаёт интерфейс `/app/` и проксирует остальное в
приложение, и как бандл React попадает в образ. Пригодится, чтобы понять единственную точку входа,
history-режим маршрутизации (фолбэк на `index.html`), политику кэша ассетов (`immutable` против
`no-store`), и почему `app`/`assets` зарезервированы под алиасы. Первый блок — дерево маршрутов
шлюза, второй — сборка образа gateway.

```mermaid
flowchart TD
    REQ["Запрос на gateway :APP_PORT"] --> H{Путь запроса}

    H -->|"= /"| R1["302 → /app/<br/>CSP, nosniff, no-referrer"]
    H -->|"= /app"| R2["302 → /app/"]
    H -->|"= /gateway-health"| GH["200 ok<br/>healthcheck compose"]
    H -->|"= /actuator/prometheus"| DEN["deny all<br/>метрики только внутри сети"]
    H -->|"/app/assets/*"| AS["статика из образа<br/>Cache-Control: public, max-age=31536000, immutable"]
    H -->|"= /app/index.html"| IX["index.html<br/>Cache-Control: no-store"]
    H -->|"/app/* (прочее)"| FB["try_files → /app/index.html<br/>history-режим, no-store"]
    H -->|"всё остальное (location /)"| PX["proxy_pass http://app:8080<br/>X-Forwarded-For/Proto/Port"]

    PX --> APP["Spring Boot<br/>GET /{code} → 302<br/>/api/**, /swagger-ui"]
    FB --> SPA["React BrowserRouter basename=/app/<br/>маршруты /login, /, /links/:code, *"]
    AS --> SPA

    classDef redir fill:#FFF3E0,stroke:#E65100,color:#BF360C;
    classDef static fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20;
    classDef proxy fill:#E3F2FD,stroke:#1565C0,color:#0D47A1;
    classDef deny fill:#FCE4EC,stroke:#AD1457,color:#880E4F;
    class R1,R2 redir;
    class AS,IX,FB,SPA static;
    class PX,APP proxy;
    class DEN,GH deny;
```

```mermaid
flowchart LR
    SRC["shortener-web/<br/>React + Vite, base /app/"] --> B1["stage build: node:26-alpine<br/>npm ci → npx vite build"]
    B1 --> DIST["dist/<br/>хэш в именах ассетов"]
    DIST --> IMG["stage final: nginx:1.30.6<br/>COPY dist → /usr/share/nginx/html/app<br/>COPY nginx.conf → default.conf"]
    IMG --> GW["образ shortener-gateway:APP_IMAGE_TAG<br/>поднимается и dev, и CI"]

    classDef build fill:#E3F2FD,stroke:#1565C0,color:#0D47A1;
    classDef out fill:#E8F5E9,stroke:#2E7D32,color:#1B5E20;
    class SRC,B1,IMG build;
    class DIST,GW out;
```

## Источники

- Корень и `/app` → 302 `/app/` — `infra/nginx/nginx.conf:55-78` (`absolute_redirect off`, CSP/nosniff/no-referrer).
- Ассеты с годовым `immutable` — `infra/nginx/nginx.conf:80-90`; `index.html` и history-фолбэк с `no-store` — `infra/nginx/nginx.conf:92-108` (`try_files $uri $uri/ /app/index.html`).
- Healthcheck шлюза — `infra/nginx/nginx.conf:37-41`; метрики наружу закрыты — `infra/nginx/nginx.conf:45-47`; проксирование прочего — `infra/nginx/nginx.conf:110-128`.
- Размер тела и таймауты прокси — `infra/nginx/nginx.conf:34,125-127`.
- Сборка образа: multi-stage, `npm ci` + `npx vite build`, копирование dist и конфига — `infra/web.Dockerfile:4-19`; контекст сборки — корень репозитория — `infra/docker-compose.yml:96-100`.
- `base: '/app/'` — `shortener-web/vite.config.ts:5`; `basename={import.meta.env.BASE_URL}` — `shortener-web/src/main.tsx:21`; маршруты SPA — `shortener-web/src/App.tsx:16-57`.
- Резерв `app`/`assets` под статику шлюза — `shortener-service/src/main/java/com/example/shortener/link/LinkService.java:43-51`; клиентская копия — `shortener-web/src/lib/validation.ts:32-33`.
- Порт приложения не публикуется, вход только через шлюз — `infra/docker-compose.yml:85-88,104-105`.