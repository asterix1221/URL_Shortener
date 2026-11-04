package com.example.shortener.clicks;

import com.example.shortener.link.ClickEvent;
import com.example.shortener.link.ClickEventRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Синхронная запись кликов: строка в {@code click_events} пишется в том же потоке и в той же
 * транзакции, что обслуживают редирект, — Kafka и фоновый консьюмер в этом пути не участвуют.
 *
 * <p>Бин выбирается только при {@code app.clicks.mode=sync}; режим нужен экспериментам этапа 7,
 * чтобы сравнить цену записи клика в пути ответа с асинхронной записью.
 *
 * <p>Исключение репозитория наружу не перехватывается: если вставка не удалась, редирект не
 * состоится, но событие не потеряется молча — в отличие от {@link KafkaClickRecorder}.
 */
@Component
@ConditionalOnProperty(name = "app.clicks.mode", havingValue = "sync")
public class SyncClickRecorder implements ClickRecorder {

    private final ClickEventRepository clicks;

    public SyncClickRecorder(ClickEventRepository clicks) {
        this.clicks = clicks;
    }

    @Override
    public void record(ClickEventMessage event) {
        clicks.save(new ClickEvent(event.linkId(), event.clickedAt(), event.ipHash(),
                event.userAgent(), event.referrer()));
    }
}
