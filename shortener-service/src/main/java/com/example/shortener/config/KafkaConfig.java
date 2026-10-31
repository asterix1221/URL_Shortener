package com.example.shortener.config;

import com.example.shortener.clicks.ClickEventPublisher;
import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
public class KafkaConfig {

    @Bean
    public NewTopic clickEventsTopic() {
        return TopicBuilder.name(ClickEventPublisher.TOPIC).partitions(3).replicas(1).build();
    }
}
