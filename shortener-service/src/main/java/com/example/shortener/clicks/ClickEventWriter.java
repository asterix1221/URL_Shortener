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
