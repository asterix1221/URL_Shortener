package com.example.shortener.clicks;

import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class KafkaClickRecorderTest {

    @Mock
    private ClickEventPublisher publisher;

    @Test
    void delegatesTheEventToPublisher() {
        ClickEventMessage event = new ClickEventMessage(3L, Instant.now(), "hash", "gatling", null);

        new KafkaClickRecorder(publisher).record(event);

        verify(publisher).publish(event);
    }
}
