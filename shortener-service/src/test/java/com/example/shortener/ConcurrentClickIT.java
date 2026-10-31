package com.example.shortener;

import com.example.shortener.link.dto.LinkResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ConcurrentClickIT extends AbstractIT {

    @Test
    void atomicLimitAllowsExactlyMaxClicksRedirects() throws Exception {
        String token = registerAndLogin();
        LinkResponse link = createLink(token, Map.of("url", "https://example.com/contended", "maxClicks", 5));

        List<Integer> statuses = parallelClicks(link.code(), 20);

        assertThat(statuses).hasSize(20);
        assertThat(statuses).filteredOn(status -> status == 302).hasSize(5);
        assertThat(statuses).filteredOn(status -> status == 410).hasSize(15);
        assertThat(clickCount(link.code())).isEqualTo(5);
        assertThat(clickEvents(link.code())).isEqualTo(5);
    }

    private List<Integer> parallelClicks(String code, int requests) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(requests);
        try {
            List<Callable<Integer>> tasks = new ArrayList<>();
            for (int i = 0; i < requests; i++) {
                tasks.add(() -> click(code, "https://concurrent.example.com").statusCode());
            }
            List<Future<Integer>> futures = pool.invokeAll(tasks);
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> future : futures) {
                statuses.add(future.get(30, TimeUnit.SECONDS));
            }
            return statuses;
        } finally {
            pool.shutdown();
        }
    }
}
