# Сценарий — Редирект GET /{code}

Диаграмма показывает полный путь публичного редиректа: от запроса через шлюз до ответа 302 с
заголовком `Location`. Пригодится, чтобы понять порядок «кэш → база → атомарный guard лимита →
запись клика», почему ссылки с `maxClicks` не кэшируются, и как ведут себя отказы Redis и Kafka.
Ветки 404 (код неизвестен) и 410 (удалена/просрочена/лимит исчерпан) показаны явно; запись клика в
режиме по умолчанию асинхронная и ответа не задерживает.

```mermaid
sequenceDiagram
    autonumber
    participant C as Клиент
    participant GW as gateway nginx
    participant RC as RedirectController
    participant LS as LinkService
    participant CA as LinkCache
    participant R as Redis
    participant LR as LinkRepository
    participant DB as PostgreSQL
    participant KR as ClickRecorder
    participant K as Kafka

    C->>GW: GET /{code}
    GW->>RC: proxy_pass + X-Forwarded-For/Proto/Port
    RC->>LS: redirect(code, ip, userAgent, referrer)
    LS->>CA: find(code)
    CA->>R: MGET link:{code} link-id:{code}

    alt Попадание в кэш
        R-->>CA: originalUrl + linkId
        CA-->>LS: Cached(linkId, originalUrl)
        LS->>KR: record(ClickEventMessage)
    else Промах / кэш выключен / Redis недоступен
        R-->>CA: null (miss/error/disabled)
        CA-->>LS: null
        LS->>LR: findByCode(code)
        LR->>DB: SELECT по ux_links_code
        alt Код неизвестен
            DB-->>LS: пусто
            LS-->>RC: NotFoundException
            RC-->>GW: 404 ApiError
            GW-->>C: 404
        else Ссылка есть
            DB-->>LS: Link
            alt Не активна или просрочена
                LS-->>RC: GoneException
                RC-->>GW: 410 ApiError
                GW-->>C: 410
            else Доступна
                opt Задан maxClicks
                    LS->>LR: increaseClickCount(id)
                    LR->>DB: UPDATE ... WHERE active AND срок AND лимит
                    alt 0 строк — лимит исчерпан сейчас
                        DB-->>LS: 0
                        LS-->>RC: GoneException
                        RC-->>GW: 410 ApiError
                        GW-->>C: 410
                    else 1 строка — списан
                        DB-->>LS: 1
                    end
                end
                LS->>CA: put(link)
                CA->>R: SET link:{code} link-id:{code} с TTL
                Note over CA,R: пропуск, если maxClicks задан или ссылка не активна
                LS->>KR: record(ClickEventMessage)
            end
        end
    end

    KR-)K: publish в click-events (async, без ожидания)
    LS-->>RC: originalUrl
    RC-->>GW: 302 + Location
    GW-->>C: 302 + Location

    Note over CA,R: Redis недоступен → result=error,<br/>редирект идёт через базу
    Note over KR,K: Kafka недоступна → 302 всё равно,<br/>растёт shortener_clicks_publish_errors_total
```

## Источники

- Вход `GET /{code}`, ответ 302 + Location — `shortener-service/src/main/java/com/example/shortener/link/RedirectController.java:41-48`; проброс заголовков шлюзом — `infra/nginx/nginx.conf:110-128`, `forward-headers-strategy: native` — `shortener-service/src/main/resources/application.yml:21-28`.
- Порядок «кэш → база → guard → клик» — `shortener-service/src/main/java/com/example/shortener/link/LinkService.java:157-177`.
- Кэш: `MGET link:{code} link-id:{code}`, теги hit/miss/error — `shortener-service/src/main/java/com/example/shortener/cache/LinkCache.java:68-86`; выключенный кэш (`app.cache.enabled=false`) не трогает Redis — `LinkCache.java:69-71`.
- Прогрев `put` с TTL, пропуск для `maxClicks`/неактивных — `LinkCache.java:105-119`; TTL = `min(ttl-seconds, секунд до expiresAt)` — `LinkCache.java:143-151`.
- 404 при неизвестном коде — `LinkService.java:165-166` (`NotFoundException`); 410 при неактивной/просроченной — `LinkService.java:167-169` (`GoneException`).
- Атомарный guard лимита — `LinkService.java:170-173`; SQL `UPDATE ... WHERE active AND (expires_at ...) AND (max_clicks ...)` — `shortener-service/src/main/java/com/example/shortener/link/LinkRepository.java:50-56`; 0 строк → GoneException — `LinkService.java:171-172`.
- Запись клика через ClickRecorder — `LinkService.java:179-181`; асинхронная публикация без ожидания — `shortener-service/src/main/java/com/example/shortener/clicks/ClickEventPublisher.java:57-77` (`max.block.ms` 500 — `application.yml:15-19`).
- Деградация Kafka: ошибка глотается, счётчик `shortener.clicks.publish.errors` — `ClickEventPublisher.java:38,62-76`; редирект остаётся успешным — `shortener-service/src/main/java/com/example/shortener/clicks/KafkaClickRecorder.java:13-15`.
- Коды 404/410 в обработчике — `shortener-service/src/main/java/com/example/shortener/common/ApiExceptionHandler.java:102-120`.