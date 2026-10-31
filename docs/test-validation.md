# Мутационная проверка тестов (этап 3, план §3.4)

Проверка «ловят ли тесты поломку»: вносим в `shortener-service` осознанную ошибку, запускаем
`.\mvnw.cmd clean verify` (в Git Bash — `./mvnw clean verify`), смотрим, какие тесты упали,
и откатываем правку `git checkout -- <файл>`. Каждая мутация — отдельный прогон, правки
не коммитились. Нумерация — как в плане.

## Базовый зелёный прогон перед мутациями

```
Tests run: 59, Failures: 0, Errors: 0     (юнит-тесты, surefire)
Tests run: 14, Failures: 0, Errors: 0     (интеграционные, failsafe: ConcurrentClickIT 1,
                                           LinkLifecycleIT 5, SchemaMigrationIT 3, SecurityIT 5)
jacoco: Analyzed bundle 'shortener-service' with 22 classes
        All coverage checks have been met.   (правило: LINE COVEREDRATIO >= 0.80)
BUILD SUCCESS
```

Покрытие по строкам: **228 покрыто / 17 пропущено = 93.0%**.

Стабильность: `.\mvnw.cmd -q verify` 5 раз подряд — `run 1 OK … run 5 OK`, падений нет.

Тесты поднимают Postgres 16 в Testcontainers; сервис под тестом подключается к порту контейнера
(`jdbc:postgresql://localhost:<порт>/test`), локальная база из `infra/docker-compose.yml`
в прогоне не участвует.

## Мутация 1 — убрать проверку владельца в `LinkService.requireOwned`

**Не выполнена.** Правка (временное удаление `if (!link.getUserId().equals(userId)) throw new
ForbiddenException(...)`) блокируется слоем разрешений агента как ослабление контроля доступа;
согласие через выбор с вариантами классификатор не принял как разрешение на этот конкретный код.
Обход блокировки другими инструментами не выполнялся, код сервиса не менялся.

Тесты, которые должны её поймать, написаны и зелёные на корректном коде:

- `LinkServiceTest.forbidsAccessToForeignLink` — `getOwned`/`stats`/`delete` чужой ссылки → `ForbiddenException`;
- `SecurityIT.foreignLinkIsHiddenFromOtherUsers` — 403 на просмотр, статистику и удаление чужой ссылки
  при сохраняющемся публичном редиректе 302.

Как проверить вручную (правка строк 123-125 и откат):

```powershell
cd shortener-service
# удали в src/main/java/com/example/shortener/link/LinkService.java проверку владельца в requireOwned
.\mvnw.cmd clean verify      # ожидаем падение LinkServiceTest и SecurityIT
git checkout -- src/main/java/com/example/shortener/link/LinkService.java
```

## Мутация 2 — атомарный `UPDATE` заменён на «прочитал, проверил, записал»

Что сломано:

- `link/LinkService.java`, метод `redirect`: лимит, срок жизни и флаг `active` проверяются в Java
  по прочитанной сущности, затем выполняется «слепой» инкремент;
- `link/LinkRepository.java`, запрос `increaseClickCount`: убраны условия
  `AND active AND (expires_at IS NULL OR expires_at > now()) AND (max_clicks IS NULL OR click_count < max_clicks)`.

Результат прогона:

```
[ERROR] Tests run: 18, Failures: 1 -- in com.example.shortener.link.LinkServiceTest
[ERROR]   LinkServiceTest.redirectOfInactiveExpiredOrExhaustedLinkIsGone:195->assertGone:205
[ERROR] Tests run: 1, Failures: 1 -- in com.example.shortener.ConcurrentClickIT
[ERROR]   ConcurrentClickIT.atomicLimitAllowsExactlyMaxClicksRedirects:26
          Expected size: 5 but was: 14 in: [302, 302, ... ]
```

Поймана: и юнит-тестом (semantics «0 строк обновлено → 410»), и интеграционным тестом
конкурентности — вместо ровно 5×302 получилось **14×302** на 20 параллельных запросов при
`maxClicks=5`, то есть классическая гонка lost update. Остальные IT (LinkLifecycleIT,
SchemaMigrationIT, SecurityIT) остались зелёными: в последовательных сценариях
read-check-write ведёт себя корректно, ловить её должен именно конкурентный тест.

## Мутация 3 — изменён алфавит Base62

Что сломано: `common/Base62.java` — алфавит `0-9A-Za-z` заменён на `0-9a-zA-Z`
(заглавные и строчные буквы переставлены местами).

Результат прогона:

```
[ERROR] Tests run: 14, Failures: 7 -- in com.example.shortener.common.Base62Test
[ERROR]   Base62Test.encodesKnownValues:18   (×7 параметризованных кейсов)
```

Поймана параметризованным тестом: `encode(10)` ожидал `"A"`, получил `"a"`; `encode(61)`
ожидал `"z"`, получил `"Z"`. Сборка остановилась на фазе surefire, интеграционные тесты до
этой мутации не дошли — регрессия кодирования видна сразу на юнит-уровне.

## Итог

Из трёх запланированных мутаций две подтверждены падением тестов (№2 и №3), одна (№1)
не выполнена из-за блокировки на уровне разрешений окружения — не из-за отсутствия тестов.
