package com.example.shortener.common;

/**
 * Кодирование целого в строку основания 62 по алфавиту
 * {@code 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz}.
 * Так сервис получает короткий код ссылки из её id.
 *
 * <p>Обратного разбора кода в число здесь нет: класс знает только
 * {@code encode}. Ведущих заполнителей тоже нет — минимальная длина строки
 * соответствует значению, поэтому разные id дают разные коды, но коды одной
 * длины покрывают только свой диапазон значений.
 */
public final class Base62 {

    private static final String ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private static final int BASE = ALPHABET.length();

    /** Экземпляры не создаются: класс — набор статических методов. */
    private Base62() {
    }

    /**
     * Переводит число в систему с основанием 62, цифрами служат символы алфавита.
     *
     * @param value кодируемое число; ноль даёт строку {@code "0"}
     * @return строка разрядов от старшего к младшему, без ведущих нулей
     * @throws IllegalArgumentException если {@code value < 0}
     */
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
