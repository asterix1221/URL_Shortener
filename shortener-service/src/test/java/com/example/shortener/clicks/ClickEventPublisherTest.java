package com.example.shortener.clicks;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Instant;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ClickEventPublisherTest {

    private static final ClickEventMessage EVENT =
            new ClickEventMessage(17L, Instant.parse("2026-11-01T09:15:00Z"), "abc123", "agent", null);

    @Mock
    private KafkaTemplate<String, String> kafka;

    private SimpleMeterRegistry metrics;
    private ObjectMapper json;

    @BeforeEach
    void createRegistry() {
        metrics = new SimpleMeterRegistry();
        json = new ObjectMapper().registerModule(new JavaTimeModule());
    }

    @Test
    void publishesPayloadKeyedByLinkId() {
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(new CompletableFuture<>());

        new ClickEventPublisher(kafka, json, metrics).publish(EVENT);

        verify(kafka).send(eq(ClickEventPublisher.TOPIC), eq("17"), anyString());
        assertThat(errors()).isZero();
    }

    @Test
    void serializationFailureIsCountedAndNotSent() {
        ObjectMapper broken = new ObjectMapper() {
            @Override
            public String writeValueAsString(Object value) throws JsonProcessingException {
                throw new JsonProcessingException("cannot serialize click event") {
                };
            }
        };

        new ClickEventPublisher(kafka, broken, metrics).publish(EVENT);

        verifyNoInteractions(kafka);
        assertThat(errors()).isEqualTo(1.0);
    }

    @Test
    void brokerRejectionIsCountedInCallback() {
        CompletableFuture<SendResult<String, String>> rejected = new CompletableFuture<>();
        rejected.completeExceptionally(new RuntimeException("not authorized to write to topic"));
        when(kafka.send(anyString(), anyString(), anyString())).thenReturn(rejected);

        new ClickEventPublisher(kafka, json, metrics).publish(EVENT);

        // send() в spring-kafka не бросает при отказе брокера: ошибка приходит в callback,
        // и без её учёта редиректы «работали» бы, а клики молча терялись
        assertThat(errors()).isEqualTo(1.0);
    }

    @Test
    void producerFailureIsSwallowedAndCounted() {
        when(kafka.send(anyString(), anyString(), anyString()))
                .thenThrow(new IllegalStateException("Kafka producer closed"));

        ClickEventPublisher publisher = new ClickEventPublisher(kafka, json, metrics);

        // редирект не должен падать из-за недоступной Kafka — это проверка того же обещания,
        // что и max.block.ms=500 в application.yml
        assertThatCode(() -> publisher.publish(EVENT)).doesNotThrowAnyException();
        assertThat(errors()).isEqualTo(1.0);
    }

    private double errors() {
        return metrics.counter("shortener.clicks.publish.errors").count();
    }
}
