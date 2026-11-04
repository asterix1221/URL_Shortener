package com.example.shortener.clicks;

import com.example.shortener.link.ClickEvent;
import com.example.shortener.link.ClickEventRepository;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class SyncClickRecorderTest {

    @Mock
    private ClickEventRepository clicks;

    @Test
    void savesEveryFieldOfTheEvent() {
        Instant at = Instant.parse("2026-11-01T10:00:00Z");

        new SyncClickRecorder(clicks).record(new ClickEventMessage(7L, at, "hash", "gatling", "https://ref"));

        ArgumentCaptor<ClickEvent> saved = ArgumentCaptor.forClass(ClickEvent.class);
        verify(clicks).save(saved.capture());
        assertThat(saved.getValue().getLinkId()).isEqualTo(7L);
        assertThat(saved.getValue().getIpHash()).isEqualTo("hash");
        assertThat(saved.getValue().getUserAgent()).isEqualTo("gatling");
        assertThat(saved.getValue().getReferrer()).isEqualTo("https://ref");
    }

    @Test
    void nullHeadersAreStoredAsIs() {
        new SyncClickRecorder(clicks)
                .record(new ClickEventMessage(8L, Instant.now(), "hash", null, null));

        ArgumentCaptor<ClickEvent> saved = ArgumentCaptor.forClass(ClickEvent.class);
        verify(clicks).save(saved.capture());
        assertThat(saved.getValue().getUserAgent()).isNull();
        assertThat(saved.getValue().getReferrer()).isNull();
    }
}
