package com.example.shortener.clicks;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

/**
 * Публикует событие клика в топик Kafka {@code click-events} с ключом сообщения, равным id
 * ссылки. Топик создаётся с тремя партициями в {@code KafkaConfig}.
 *
 * <p>Публикация идёт с пути редиректа, но подтверждения брокера не ждёт: ответ клиенту не
 * зависит от того, как быстро событие запишется в топик. Синхронной остаётся лишь сама отправка,
 * ограниченная {@code max.block.ms} (в конфигурации — 500 мс).
 *
 * <p>Ошибки отсюда наружу не летят: они лишь увеличивают счётчик
 * {@code shortener.clicks.publish.errors} и попадают в лог — детали в {@code publish}.
 */
@Component
public class ClickEventPublisher {

    /** Имя топика, в который пишутся события клика; его же слушает {@link ClickEventWriter}. */
    public static final String TOPIC = "click-events";

    private static final Logger log = LoggerFactory.getLogger(ClickEventPublisher.class);

    private final KafkaTemplate<String, String> kafka;
    private final ObjectMapper json;
    private final Counter errors;

    public ClickEventPublisher(KafkaTemplate<String, String> kafka, ObjectMapper json, MeterRegistry metrics) {
        this.kafka = kafka;
        this.json = json;
        this.errors = metrics.counter("shortener.clicks.publish.errors");
    }

    /**
     * Сериализует событие в JSON и отдаёт его в топик {@code click-events}.
     *
     * <p>Неудачи обрабатываются внутри метода и наружу не выпускаются. Не сериализовавшееся
     * сообщение ({@code JsonProcessingException}) не отправляется вовсе — метод возвращается
     * сразу. Если брокер отверг уже отправленное сообщение, об этом сообщает колбэк
     * {@code whenComplete}. Если {@code kafka.send} бросил {@code RuntimeException} (Kafka
     * недоступна, истёк {@code max.block.ms}), исключение перехватывается здесь.
     *
     * <p>Каждый из трёх случаев добавляет единицу в счётчик
     * {@code shortener.clicks.publish.errors} и пишет {@code warn} с id ссылки; повторных
     * попыток нет, событие теряется.
     *
     * @param event событие клика; ключом сообщения становится строка {@code event.linkId()},
     *              поэтому клики одной ссылки всегда попадают в одну партицию
     */
    public void publish(ClickEventMessage event) {
        String payload;
        try {
            payload = json.writeValueAsString(event);
        } catch (JsonProcessingException ex) {
            errors.increment();
            log.warn("cannot serialize click event for link {}", event.linkId(), ex);
            return;
        }
        try {
            kafka.send(TOPIC, String.valueOf(event.linkId()), payload).whenComplete((result, failure) -> {
                if (failure != null) {
                    errors.increment();
                    log.warn("kafka rejected click event for link {}: {}", event.linkId(), failure.toString());
                }
            });
        } catch (RuntimeException ex) {
            errors.increment();
            log.warn("kafka unavailable for click event of link {}: {}", event.linkId(), ex.toString());
        }
    }
}
