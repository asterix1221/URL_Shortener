package com.example.shortener.clicks;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Асинхронная запись кликов: событие уходит в Kafka, а строку в {@code click_events} дописывает
 * фоновый {@link ClickEventWriter}. Это режим по умолчанию — редирект не ждёт обращения к базе.
 *
 * <p>Бин выбирается при {@code app.clicks.mode=async} и когда свойство не задано вовсе
 * ({@code matchIfMissing}).
 *
 * <p>Ошибок наружу не выпускает: {@link ClickEventPublisher#publish} перехватывает отказ Kafka и
 * лишь увеличивает счётчик {@code shortener.clicks.publish.errors}, то есть при недоступном
 * брокере редирект остаётся успешным, а событие теряется.
 */
@Component
@ConditionalOnProperty(name = "app.clicks.mode", havingValue = "async", matchIfMissing = true)
public class KafkaClickRecorder implements ClickRecorder {

    private final ClickEventPublisher publisher;

    public KafkaClickRecorder(ClickEventPublisher publisher) {
        this.publisher = publisher;
    }

    @Override
    public void record(ClickEventMessage event) {
        publisher.publish(event);
    }
}
