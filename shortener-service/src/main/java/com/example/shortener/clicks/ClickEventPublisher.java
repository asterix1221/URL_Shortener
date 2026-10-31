package com.example.shortener.clicks;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClickEventPublisher {

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
