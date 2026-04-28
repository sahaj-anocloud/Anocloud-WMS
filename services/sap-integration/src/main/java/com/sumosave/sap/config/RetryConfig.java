package com.sumosave.sap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.retry.backoff.ExponentialBackOffPolicy;
import org.springframework.retry.policy.SimpleRetryPolicy;
import org.springframework.retry.support.RetryTemplate;

/**
 * Spring Retry configuration for SAP integration calls.
 *
 * Backoff schedule (exponential, multiplier=3):
 *   Attempt 1 -> wait 5s  -> Attempt 2
 *   Attempt 2 -> wait 15s -> Attempt 3
 *   Attempt 3 -> wait 45s -> Attempt 4
 *   Attempt 4 -> wait 135s (capped at 120s / 2 min) -> give up
 *
 * Max attempts: 4 (1 initial + 3 retries)
 */
@Configuration
public class RetryConfig {

    private static final int    MAX_ATTEMPTS      = 4;
    private static final long   INITIAL_INTERVAL  = 5_000L;   // 5 s
    private static final double MULTIPLIER        = 3.0;
    private static final long   MAX_INTERVAL      = 120_000L; // 2 min

    @Bean
    public RetryTemplate sapRetryTemplate() {
        RetryTemplate template = new RetryTemplate();

        ExponentialBackOffPolicy backOff = new ExponentialBackOffPolicy();
        backOff.setInitialInterval(INITIAL_INTERVAL);
        backOff.setMultiplier(MULTIPLIER);
        backOff.setMaxInterval(MAX_INTERVAL);
        template.setBackOffPolicy(backOff);

        SimpleRetryPolicy retryPolicy = new SimpleRetryPolicy();
        retryPolicy.setMaxAttempts(MAX_ATTEMPTS);
        template.setRetryPolicy(retryPolicy);

        return template;
    }
}
