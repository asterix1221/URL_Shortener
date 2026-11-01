package com.example.shortener.link;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Адрес клиента в статистику попадает как SHA-256(ip + соль), а не как IP: событие клика
 * хранит только хэш, поэтому по базе нельзя восстановить, с какого адреса был переход.
 */
@Component
public class IpHasher {

    private static final String ALGORITHM = "SHA-256";

    /**
     * Instance {@link MessageDigest} создаётся на каждый вызов — сам digest не потокобезопасен.
     * Фабрика вынесена в параметр, чтобы можно было проверить ветку «алгоритма нет»:
     * SHA-256 обязателен по спецификации JVM, и в проде {@link MessageDigest#getInstance}
     * для него не бросает, но обработка этого исключения в коде есть и она должна быть тестом,
     * а не строкой «непокрыто, потому что недостижимо».
     */
    interface DigestFactory {
        MessageDigest create() throws NoSuchAlgorithmException;
    }

    private final String salt;
    private final DigestFactory digests;

    @Autowired
    public IpHasher(@Value("${app.ip-salt}") String salt) {
        this(salt, () -> MessageDigest.getInstance(ALGORITHM));
    }

    IpHasher(String salt, DigestFactory digests) {
        this.salt = salt;
        this.digests = digests;
    }

    public String hash(String ip) {
        if (ip == null || ip.isBlank()) {
            return null;
        }
        MessageDigest digest;
        try {
            digest = digests.create();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ALGORITHM + " is not available", ex);
        }
        return HexFormat.of().formatHex(digest.digest((ip + salt).getBytes(StandardCharsets.UTF_8)));
    }
}
