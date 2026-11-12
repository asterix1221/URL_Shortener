# Мутационная проверка тестов (этап 3, план §3.4)

Проверка «ловят ли тесты поломку»: вносим в `shortener-service` осознанную ошибку, запускаем
`.\mvnw.cmd clean verify` (в Git Bash — `./mvnw clean verify`), смотрим, какие тесты упали,
и восстанавливаем только временно изменённый фрагмент. Каждая мутация — отдельный прогон,
правки не коммитились. Нумерация — как в плане. Мутация №1 дополнительно проверена
2026-11-12 в отдельном worktree на `6aefea1`; исходники основного checkout не менялись.

## Исторический базовый прогон этапа 3 (перед мутациями №2 и №3)

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

**Выполнена 2026-11-12.** Прежняя попытка была заблокирована разрешениями; после отдельного
адресного согласия проверка проведена в изолированном worktree на `6aefea1`. Перед изменением
полный `clean verify` прошёл: **104 юнит-теста + 19 IT**, без падений, гейт JaCoCo выполнен.

Временно удалён только блок `if (!link.getUserId().equals(userId))`, выбрасывающий
`ForbiddenException` в `LinkService.requireOwned`. Тесты и настройки покрытия не менялись.
Два уровня запускались отдельно: иначе падение Surefire остановило бы Maven до Failsafe.

```text
bash mvnw -B test -Dtest=LinkServiceTest#forbidsAccessToForeignLink
Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
LinkServiceTest.forbidsAccessToForeignLink:254
Expecting code to raise a throwable.
BUILD FAILURE (exit 1)

bash mvnw -B test-compile failsafe:integration-test failsafe:verify -Dit.test=SecurityIT#foreignLinkIsHiddenFromOtherUsers
Tests run: 1, Failures: 1, Errors: 0, Skipped: 0
SecurityIT.foreignLinkIsHiddenFromOtherUsers:60
expected: 403
 but was: 200
BUILD FAILURE (exit 1)
```

Оба падения — нарушения утверждений о доступе к чужой ссылке, не ошибки запуска или компиляции.
Каждый тест остановился на первом утверждении просмотра: утверждения статистики и удаления
после него в красном прогоне не исполнялись. IT использовал отдельные PostgreSQL, Redis и Kafka
в Testcontainers; основная база не участвовала.

После точного восстановления блока `git diff --exit-code -- <LinkService.java>` вернул 0;
полный `bash mvnw -B clean verify` снова завершился `BUILD SUCCESS`: **104 юнит-теста + 19 IT**,
0 failures/errors/skipped, **JaCoCo 387/387 строк (100%)**, гейт 1.00 не менялся.
Мутация не коммитилась. На Windows во всех этих запусках использовался абсолютный путь
`C:/Program Files/Git/bin/bash.exe`: вызов `bash` по короткому имени из Python до проверки
давал ошибку `JAVA_HOME`, не запуская тестов; этот сбой не засчитывается как обнаружение мутации.

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

Все **три запланированные мутации** подтверждены падением тестов: №2 и №3 — в исходной серии
этапа 3, №1 — дополнительно 2026-11-12. После последней мутации исходный код восстановлен,
полный прогон зелёный; временные дефекты в историю репозитория не попадали.
