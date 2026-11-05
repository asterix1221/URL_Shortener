package com.example.shortener.link;

import com.example.shortener.cache.LinkCache;
import com.example.shortener.clicks.ClickEventMessage;
import com.example.shortener.clicks.ClickRecorder;
import com.example.shortener.common.Base62;
import com.example.shortener.common.BadRequestException;
import com.example.shortener.common.ConflictException;
import com.example.shortener.common.ForbiddenException;
import com.example.shortener.common.GoneException;
import com.example.shortener.common.InvalidUrlException;
import com.example.shortener.common.NotFoundException;
import com.example.shortener.link.dto.CreateLinkRequest;
import com.example.shortener.link.dto.LinkResponse;
import com.example.shortener.link.dto.LinkStatsResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Бизнес-логика ссылок: создание, редирект со списанием клика, постраничный список,
 * статистика и удаление. Всё, что связано с HTTP, кодами и правами доступа, живёт здесь;
 * контроллеры только пробрасывают сюда принципала из JWT.
 *
 * <p>Все методы работают в транзакции; методы чтения помечены {@code readOnly = true}.
 * Доступ к чужой ссылке (по коду) отдаёт {@code ForbiddenException}, а не {@code NotFound}:
 * код публичен через редирект, поэтому факт существования ссылки не секрет.
 */
@Service
public class LinkService {

    /** Алиас совпадает по алфавиту и длине с кодом Base62, чтобы редирект не делал исключений. */
    private static final Pattern ALIAS_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{3,32}$");

    /**
     * Коды, которые нельзя отдавать под алиасы: они принадлежат маршрутам приложения
     * ({@code /api}, {@code /actuator}, {@code /swagger-ui}, {@code /v3}) и редирект по такому
     * коду всё равно был бы недоступен. {@code app} и {@code assets} занимает gateway для
     * статики интерфейса ({@code location /app/}), и ссылка с таким кодом перекрывалась бы
     * отдачей бандла вместо 302.
     */
    private static final Set<String> RESERVED_CODES =
            Set.of("api", "actuator", "swagger-ui", "v3", "app", "assets");

    private final LinkRepository links;
    private final ClickEventRepository clicks;
    private final LinkCache cache;
    private final ClickRecorder clickEvents;
    private final String baseUrl;
    private final IpHasher ipHasher;

    /**
     * @param links       репозиторий ссылок; id берётся из последовательности {@code link_seq}
     * @param clicks      репозиторий событий кликов (нужен только для статистики)
     * @param cache       кэш адресов в Redis; редирект без него работал бы в один запрос больше
     * @param clickEvents запись события клика — асинхронно в Kafka или сразу в базу, в
     *                    зависимости от {@code app.clicks.mode}
     * @param baseUrl     значение {@code app.base-url}: из него собирается {@code shortUrl}
     * @param ipHasher    хешер адреса клиента (IP в базу не попадает)
     */
    public LinkService(LinkRepository links, ClickEventRepository clicks, LinkCache cache,
                       ClickRecorder clickEvents,
                       @Value("${app.base-url}") String baseUrl,
                       IpHasher ipHasher) {
        this.links = links;
        this.clicks = clicks;
        this.cache = cache;
        this.clickEvents = clickEvents;
        this.baseUrl = baseUrl;
        this.ipHasher = ipHasher;
    }

    /**
     * Создаёт ссылку: проверяет адрес и параметры, выбирает код (алиас или Base62 от id) и
     * сохраняет активную запись.
     *
     * <p>Код генерируется из id, который заранее берётся из {@code link_seq}, поэтому два
     * соседних вызова не могут выдать одинаковый код; занятость алиаса проверяется по индексу.
     *
     * @param userId  владелец из JWT
     * @param request адрес, необязательные алиас, {@code expiresAt} и {@code maxClicks}
     * @return созданная ссылка, включая {@code shortUrl} на базе {@code app.base-url}
     * @throws InvalidUrlException   если адрес не http(s) или без хоста
     * @throws BadRequestException   если {@code expiresAt} в прошлом, {@code maxClicks} &lt; 1,
     *                               алиас не проходит {@code ALIAS_PATTERN} или зарезервирован
     * @throws ConflictException     если алиас уже занят
     */
    @Transactional
    public LinkResponse create(Long userId, CreateLinkRequest request) {
        String url = UrlValidator.requireHttpUrl(request.url());
        Instant expiresAt = request.expiresAt();
        if (expiresAt != null && !expiresAt.isAfter(Instant.now())) {
            throw new BadRequestException("expiresAt: must be in the future");
        }
        Integer maxClicks = request.maxClicks();
        if (maxClicks != null && maxClicks < 1) {
            throw new BadRequestException("maxClicks: must be greater than or equal to 1");
        }

        String alias = request.alias();
        Long id = links.nextId();
        String code;
        if (alias == null || alias.isBlank()) {
            code = Base62.encode(id);
        } else {
            if (!ALIAS_PATTERN.matcher(alias).matches()) {
                throw new BadRequestException("alias: must match ^[A-Za-z0-9_-]{3,32}$");
            }
            if (RESERVED_CODES.contains(alias.toLowerCase())) {
                throw new BadRequestException("alias: reserved word " + alias);
            }
            if (links.existsByCode(alias)) {
                throw new ConflictException("alias already taken: " + alias);
            }
            code = alias;
        }

        Link saved = links.save(new Link(id, code, url, Instant.now(), userId, expiresAt, maxClicks));
        return toResponse(saved);
    }

    /**
     * Возвращает адрес-оригинал по коду и регистрирует клик.
     *
     * <p>Сначала пробуется кэш: попадание — это один запрос в Redis и публикация события, БД не
     * трогается. В промахе читается ссылка, проверяется доступность (активность и
     * {@code expiresAt}), и для ссылок с {@code maxClicks} счётчик списывается атомарным
     * {@code UPDATE} — ноль строк означает «лимит исчерпан прямо сейчас».
     *
     * <p>Ссылки с {@code maxClicks} в кэш не кладутся (см. {@code LinkCache.put}), поэтому их
     * доступность всегда проверяется по свежему счётчику в базе. При
     * {@code app.cache.enabled=false} ({@code APP_CACHE_ENABLED=false}) кэш не читается и не
     * пополняется вовсе — каждый редирект идёт в базу.
     *
     * <p>Событие клика записывается через {@link ClickRecorder}: в режиме по умолчанию
     * ({@code app.clicks.mode=async}) оно публикуется в Kafka и не ждёт записи — строку в
     * {@code click_events} дописывает фоновый консьюмер, поэтому статистика «догоняет» редирект
     * с задержкой в сотни миллисекунд. В {@code sync} та же строка пишется здесь же, в пути
     * ответа.
     *
     * @param code      короткий код из пути
     * @param ip        адрес клиента из {@code HttpServletRequest}, в базу уходит только его хеш
     * @param userAgent заголовок {@code User-Agent}, может быть {@code null}
     * @param referrer  заголовок {@code Referer}, может быть {@code null}
     * @return оригинальный адрес для редиректа
     * @throws NotFoundException ссылка с таким кодом никогда не существовала
     * @throws GoneException     ссылка удалена, просрочена или исчерпала {@code maxClicks}
     */
    @Transactional
    public String redirect(String code, String ip, String userAgent, String referrer) {
        LinkCache.Cached cached = cache.find(code);
        if (cached != null) {
            recordClick(cached.linkId(), ip, userAgent, referrer);
            return cached.originalUrl();
        }

        Link link = links.findByCode(code)
                .orElseThrow(() -> new NotFoundException("link not found: " + code));
        if (!link.isActive() || (link.getExpiresAt() != null && !link.getExpiresAt().isAfter(Instant.now()))) {
            throw new GoneException("link is not available: " + code);
        }
        // атомарный guard нужен только ссылкам с лимитом кликов: он же и проверяет доступность
        if (link.getMaxClicks() != null && links.increaseClickCount(link.getId()) == 0) {
            throw new GoneException("link is not available: " + code);
        }
        cache.put(link);
        recordClick(link.getId(), ip, userAgent, referrer);
        return link.getOriginalUrl();
    }

    private void recordClick(Long linkId, String ip, String userAgent, String referrer) {
        clickEvents.record(new ClickEventMessage(linkId, Instant.now(), ipHasher.hash(ip), userAgent, referrer));
    }

    /**
     * Ссылки одного пользователя страницей. Порядок задаётся явно — {@code createdAt DESC,
     * id DESC}: без сортировки Postgres не гарантирует его вовсе, и одна строка могла бы
     * повториться на двух страницах или исчезнуть между ними, а список в интерфейсе полагается
     * на то, что страницы стабильны и идут от свежих ссылок к старым.
     *
     * <p>{@code id} вторым ключом убирает остаток неопределённости при равных {@code createdAt}:
     * {@code scripts/seed.sql} загружает 100 000 ссылок одним {@code INSERT ... SELECT} без
     * {@code created_at}, колонка берёт {@code DEFAULT now()}, а {@code now()} в Postgres равен
     * метке транзакции — у всего сида он одинаковый. {@code id} уникален и выдаётся из
     * {@code link_seq} до вставки, поэтому порядок полон уже на таких данных.
     *
     * @param page номер страницы, отсчёт от нуля
     * @param size размер страницы (контроллер ограничивает сверху 100)
     */
    @Transactional(readOnly = true)
    public Page<LinkResponse> list(Long userId, int page, int size) {
        return links.findByUserId(userId,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id")))
                .map(this::toResponse);
    }

    /**
     * Одна своя ссылка по коду — то же представление, что в списке и при создании.
     *
     * @throws NotFoundException ссылка отсутствует
     * @throws ForbiddenException ссылка принадлежит другому пользователю
     */
    @Transactional(readOnly = true)
    public LinkResponse getOwned(Long userId, String code) {
        return toResponse(requireOwned(userId, code));
    }

    /**
     * «Удаляет» ссылку: деактивирует запись и выбрасывает обе кэш-ключи кода. Строка в базе
     * и уже записанные события кликов остаются — статистика и внешние ссылки на id не ломаются,
     * а редирект по такому коду с этого момента отдаёт 410.
     */
    @Transactional
    public void delete(Long userId, String code) {
        Link link = requireOwned(userId, code);
        links.deactivate(link.getId());
        cache.evict(code);
    }

    /**
     * Сводка кликов по своей ссылке: общее число, разбивка по дням (UTC) и топ-10 referrer'ов.
     *
     * <p>Считается по {@code click_events}, то есть по уже записанным консьюмером событиям;
     * клики, которые ещё в пути из Kafka, в цифрах отсутствуют. Дни считаются в UTC, потому что
     * {@code clicked_at} хранится instant'ом, а разбивка делается в Postgres через
     * {@code date_trunc}.
     *
     * @throws NotFoundException ссылка отсутствует
     * @throws ForbiddenException ссылка принадлежит другому пользователю
     */
    @Transactional(readOnly = true)
    public LinkStatsResponse stats(Long userId, String code) {
        Link link = requireOwned(userId, code);
        List<LinkStatsResponse.DailyClicks> byDay = clicks.clicksByDay(link.getId()).stream()
                .map(row -> new LinkStatsResponse.DailyClicks(toLocalDate(row[0]), ((Number) row[1]).longValue()))
                .toList();
        List<LinkStatsResponse.ReferrerClicks> top = clicks.topReferrers(link.getId()).stream()
                .map(row -> new LinkStatsResponse.ReferrerClicks((String) row[0], ((Number) row[1]).longValue()))
                .toList();
        return new LinkStatsResponse(link.getCode(), clicks.countByLinkId(link.getId()), byDay, top);
    }

    private Link requireOwned(Long userId, String code) {
        Link link = links.findByCode(code)
                .orElseThrow(() -> new NotFoundException("link not found: " + code));
        if (!link.getUserId().equals(userId)) {
            throw new ForbiddenException("access denied for link: " + code);
        }
        return link;
    }

    private LocalDate toLocalDate(Object day) {
        return ((java.sql.Date) day).toLocalDate();
    }

    private LinkResponse toResponse(Link link) {
        return new LinkResponse(link.getCode(), baseUrl + "/" + link.getCode(), link.getOriginalUrl(),
                link.getCreatedAt(), link.getExpiresAt(), link.getMaxClicks(), link.isActive());
    }
}
