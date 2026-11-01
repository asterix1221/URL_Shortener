package com.example.shortener.config;

import com.example.shortener.clicks.ClickEventPublisher;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

/**
 * Конфигурация Kafka: объявляет единственный бин {@link NewTopic} — топик событий
 * кликов {@code click-events}, имя взято из константы
 * {@link ClickEventPublisher#TOPIC}, чтобы продюсер и описание не разъезжались.
 *
 * <p>Параметры топика (3 партиции, 1 реплика) захардкожены, адрес брокера и
 * настройки клиента задаются вне этого класса стандартными ключами
 * {@code spring.kafka.*}.
 */
@Configuration
public class KafkaConfig {

    /**
     * @return описание топика кликов для администратора Spring Kafka; само по себе
     *         ничего не отправляет и не читает
     */
    @Bean
    public NewTopic clickEventsTopic() {
        return TopicBuilder.name(ClickEventPublisher.TOPIC).partitions(3).replicas(1).build();
    }
}
