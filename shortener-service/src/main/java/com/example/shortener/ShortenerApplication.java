package com.example.shortener;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Точка входа сервиса. {@code @SpringBootApplication} включает автоконфигурацию и сканирование
 * пакета {@code com.example.shortener} вместе с вложенными пакетами, откуда собираются
 * контроллеры, сервисы и конфигурационные бины ({@code KafkaConfig}, {@code SecurityConfig} и
 * прочие {@code @Configuration}).
 */
@SpringBootApplication
public class ShortenerApplication {

    /**
     * Поднимает веб-приложение: настройки берутся из {@code application.yml}, где значения по
     * умолчанию переопределяются переменными окружения ({@code DB_URL}, {@code REDIS_HOST},
     * {@code KAFKA_BOOTSTRAP}). Управление возвращается после поднятия контекста, а приложение
     * работает до остановки сервиса.
     *
     * @param args аргументы командной строки, передаются в {@code SpringApplication.run} без
     *             изменений
     */
    public static void main(String[] args) {
        SpringApplication.run(ShortenerApplication.class, args);
    }
}
