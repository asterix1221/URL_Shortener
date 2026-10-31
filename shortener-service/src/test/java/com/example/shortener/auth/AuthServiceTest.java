package com.example.shortener.auth;

import com.example.shortener.auth.dto.AuthResponse;
import com.example.shortener.auth.dto.LoginRequest;
import com.example.shortener.auth.dto.RegisterRequest;
import com.example.shortener.common.ConflictException;
import com.example.shortener.common.InvalidCredentialsException;
import com.example.shortener.user.User;
import com.example.shortener.user.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AuthServiceTest {

    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    @Mock
    private UserRepository users;

    @Test
    void registersUserWithHashedPassword() {
        AuthService service = new AuthService(users, encoder, mock(TokenService.class));

        service.register(new RegisterRequest("new@example.com", "Passw0rd!"));

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("new@example.com");
        assertThat(saved.getValue().getPasswordHash()).isNotEqualTo("Passw0rd!");
        assertThat(encoder.matches("Passw0rd!", saved.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void rejectsDuplicateEmailIgnoringCase() {
        AuthService service = new AuthService(users, encoder, mock(TokenService.class));
        when(users.findByEmailIgnoreCase("dup@example.com"))
                .thenReturn(Optional.of(new User("Dup@example.com", "hash", Instant.now())));

        assertThatExceptionOfType(ConflictException.class)
                .isThrownBy(() -> service.register(new RegisterRequest("dup@example.com", "Passw0rd!")));
        verify(users, never()).save(any());
    }

    @Test
    void rejectsUnknownEmailOnLogin() {
        AuthService service = new AuthService(users, encoder, mock(TokenService.class));
        when(users.findByEmailIgnoreCase("ghost@example.com")).thenReturn(Optional.empty());

        assertThatExceptionOfType(InvalidCredentialsException.class)
                .isThrownBy(() -> service.login(new LoginRequest("ghost@example.com", "Passw0rd!")));
    }

    @Test
    void rejectsWrongPasswordOnLogin() {
        AuthService service = new AuthService(users, encoder, mock(TokenService.class));
        when(users.findByEmailIgnoreCase("user@example.com")).thenReturn(
                Optional.of(new User("user@example.com", encoder.encode("AnotherPass1"), Instant.now())));

        assertThatExceptionOfType(InvalidCredentialsException.class)
                .isThrownBy(() -> service.login(new LoginRequest("user@example.com", "Passw0rd!")));
    }

    @Test
    void storedHashDoesNotMatchAnotherPassword() {
        String hash = encoder.encode("Passw0rd!");

        assertThat(encoder.matches("WrongPass1!", hash)).isFalse();
        assertThat(encoder.matches("Passw0rd!", hash)).isTrue();
    }

    @Test
    void issuesTokenForValidCredentials() {
        TokenService tokens = mock(TokenService.class);
        when(tokens.issue(7L, "user@example.com")).thenReturn(new Jwt("token-value",
                Instant.now(), Instant.now().plusSeconds(3600),
                java.util.Map.of("alg", "HS256"), java.util.Map.of("sub", "7")));
        when(tokens.ttlSeconds()).thenReturn(3600L);
        AuthService service = new AuthService(users, encoder, tokens);
        User user = new User("user@example.com", encoder.encode("Passw0rd!"), Instant.now());
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", 7L);
        when(users.findByEmailIgnoreCase("user@example.com")).thenReturn(Optional.of(user));

        AuthResponse response = service.login(new LoginRequest("user@example.com", "Passw0rd!"));

        assertThat(response.accessToken()).isEqualTo("token-value");
        assertThat(response.expiresIn()).isEqualTo(3600L);
    }
}
