package com.example.shortener.clicks;

/**
 * Способ сохранить событие клика. Выбор реализации — за свойством {@code app.clicks.mode}
 * ({@code APP_CLICKS_MODE}): {@code async} публикует событие в Kafka, {@code sync} пишет строку
 * в {@code click_events} прямо в потоке запроса.
 *
 * <p>Поведение при отказе различается и описано у реализаций: {@link KafkaClickRecorder} ошибку
 * глотает (редирект остаётся успешным, событие теряется), {@link SyncClickRecorder} отдаёт её
 * наружу — тогда редирект не состоится, но и клик не потеряется молча.
 */
public interface ClickRecorder {

    /**
     * Сохраняет одно событие клика.
     *
     * @param event ссылка, момент, хеш адреса клиента и заголовки запроса
     */
    void record(ClickEventMessage event);
}
