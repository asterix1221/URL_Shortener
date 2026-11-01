package com.example.shortener.clicks;

import com.example.shortener.link.ClickEvent;
import com.example.shortener.link.ClickEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ClickEventWriterTest {

    @Mock
    private ClickEventRepository clicks;

    private ObjectMapper json;
    private ClickEventWriter writer;

    @BeforeEach
    void createWriter() {
        json = new ObjectMapper().registerModule(new JavaTimeModule());
        writer = new ClickEventWriter(clicks, json);
    }

    @Test
    void savesEventFromTopic() throws Exception {
        Instant clickedAt = Instant.parse("2026-11-01T09:15:00Z");
        String payload = json.writeValueAsString(
                new ClickEventMessage(17L, clickedAt, "abc123", "integration-test", "https://habr.com/"));

        writer.onMessage(payload);

        ArgumentCaptor<ClickEvent> saved = ArgumentCaptor.forClass(ClickEvent.class);
        verify(clicks).save(saved.capture());
        // поля события из топика доезжают до строки базы в том же порядке: проверка через
        // геттеры сущности, потому что перепутать linkId и ipHash местами — молча теряемая статистика
        assertThat(saved.getValue().getLinkId()).isEqualTo(17L);
        assertThat(saved.getValue().getIpHash()).isEqualTo("abc123");
        assertThat(saved.getValue().getUserAgent()).isEqualTo("integration-test");
        assertThat(saved.getValue().getReferrer()).isEqualTo("https://habr.com/");
    }

    @Test
    void dropsMalformedEventWithoutFailingTheConsumer() {
        writer.onMessage("{this is not json");

        // Битое сообщение осталось бы в топике и блокило партицию, если бы слушатель падал:
        // здесь он пишет в лог и возвращает управление.
        verifyNoInteractions(clicks);
    }

    @Test
    void dropsEventOfUnexpectedShape() {
        // массив вместо объекта: readValue не проходит, и в базу не идёт ничего
        writer.onMessage("[1,2,3]");

        verifyNoInteractions(clicks);
    }
}
