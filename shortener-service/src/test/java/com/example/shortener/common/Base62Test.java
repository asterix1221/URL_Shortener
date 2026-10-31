package com.example.shortener.common;

import java.util.stream.Stream;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

class Base62Test {

    @ParameterizedTest
    @MethodSource("knownValues")
    void encodesKnownValues(long value, String expected) {
        assertThat(Base62.encode(value)).isEqualTo(expected);
    }

    static Stream<Arguments> knownValues() {
        return Stream.of(
                Arguments.of(0L, "0"),
                Arguments.of(1L, "1"),
                Arguments.of(9L, "9"),
                Arguments.of(10L, "A"),
                Arguments.of(35L, "Z"),
                Arguments.of(36L, "a"),
                Arguments.of(61L, "z"),
                Arguments.of(62L, "10"),
                Arguments.of(100000L, "Q0u"),
                Arguments.of(3843L, "zz"),
                Arguments.of(Long.MAX_VALUE, "AzL8n0Y58m7")
        );
    }

    @Test
    void rejectsNegativeValue() {
        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> Base62.encode(-1))
                .withMessageContaining("non-negative");
    }

    @Test
    void usesOnlyAlphabetCharacters() {
        for (long i = 0; i < 10_000; i++) {
            String encoded = Base62.encode(i);
            assertThat(encoded).matches("[0-9A-Za-z]+");
        }
    }

    @Test
    void encodingIsMonotonicInLengthForSequenceStart() {
        String first = Base62.encode(100_000);
        String second = Base62.encode(100_001);
        Assertions.assertNotEquals(first, second);
    }
}
