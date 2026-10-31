package com.example.shortener.common;

public final class Base62 {

    private static final String ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int BASE = ALPHABET.length();

    private Base62() {
    }

    public static String encode(long value) {
        if (value < 0) {
            throw new IllegalArgumentException("value must be non-negative: " + value);
        }
        if (value == 0) {
            return "0";
        }
        StringBuilder chars = new StringBuilder();
        long remaining = value;
        while (remaining > 0) {
            chars.append(ALPHABET.charAt((int) (remaining % BASE)));
            remaining /= BASE;
        }
        return chars.reverse().toString();
    }
}
