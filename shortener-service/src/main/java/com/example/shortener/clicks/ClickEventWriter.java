package com.example.shortener.clicks;

import com.example.shortener.link.ClickEvent;
import com.example.shortener.link.ClickEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Фоновый консьюмер, который читает события клика из топика {@code click-events} в группе
 * {@code click-writer} и пишет их в таблицу {@code click_events} через
 * {@code ClickEventRepository}.
 *
 * <p>К пути ответа пользователя не относится: задержка и отказы записи на редирект не влияют,
 * а сервис без консьюмера продолжает работать. Бин создаётся только при
 * {@code app.clicks.consumer-enabled=true}; свойство по умолчанию включено
 * ({@code matchIfMissing}), а {@code APP_CLICKS_CONSUMER_ENABLED=false} оставляет события
 * накапливаться в топике.
 *
 * <p>Дедупликации здесь нет: на каждое полученное сообщение создаётся новая строка, а в таблице
 * {@code click_events} уникального ограничения не задано, поэтому повторная доставка того же
 * события даёт дубликат в статистике.
 */
@Component
@ConditionalOnProperty(name = "app.clicks.consumer-enabled", havingValue = "true", matchIfMissing = true)
public class ClickEventWriter {

    private static final Logger log = LoggerFactory.getLogger(ClickEventWriter.class);

    private final ClickEventRepository clicks;
    private final ObjectMapper json;

    public ClickEventWriter(ClickEventRepository clicks, ObjectMapper json) {
        this.clicks = clicks;
        this.json = json;
    }

    /**
     * Преобразует JSON из топика в {@link ClickEventMessage} и сохраняет одну строку клика с
     * полями {@code linkId}, {@code clickedAt}, {@code ipHash}, {@code userAgent} и
     * {@code referrer}.
     *
     * <p>Сообщение, которое не парсится ({@code JsonProcessingException}), лишь пишется в лог с
     * исходным текстом и отбрасывается: метод выходит без исключения, повторной доставки этого
     * сообщения не будет. Поля не проверяются — строка записывается как есть. Исключение
     * репозитория или недоступность базы данным методом не перехватываются и уходят в контейнер
     * слушателя.
     *
     * @param payload JSON-представление {@link ClickEventMessage} из топика {@code click-events}
     */
    @KafkaListener(topics = ClickEventPublisher.TOPIC, groupId = "click-writer")
    public void onMessage(String payload) {
        ClickEventMessage event;
        try {
            event = json.readValue(payload, ClickEventMessage.class);
        } catch (JsonProcessingException ex) {
            log.warn("dropping malformed click event: {}", payload, ex);
            return;
        }
        clicks.save(new ClickEvent(event.linkId(), event.clickedAt(), event.ipHash(),
                event.userAgent(), event.referrer()));
    }
}
