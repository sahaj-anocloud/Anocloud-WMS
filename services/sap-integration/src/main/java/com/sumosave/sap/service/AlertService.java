package com.sumosave.sap.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.sqs.SqsClient;
import software.amazon.awssdk.services.sqs.model.SendMessageRequest;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Service for sending alerts to SQS queue.
 */
@Service
public class AlertService {

    private static final Logger logger = LoggerFactory.getLogger(AlertService.class);

    private final SqsClient sqsClient;
    private final String alertQueueUrl;
    private final ObjectMapper objectMapper;

    public AlertService(
            @Value("${aws.sqs.alert-queue-url}") String alertQueueUrl,
            @Value("${aws.region}") String region) {
        this.alertQueueUrl = alertQueueUrl;
        this.sqsClient = SqsClient.builder()
                .region(Region.of(region))
                .build();
        this.objectMapper = new ObjectMapper();
    }

    /**
     * Send alert for blocked PO lines referencing non-Active SKUs.
     */
    public void sendBlockedPOLineAlert(String dcId, String sapPoNumber, List<String> blockedSkuCodes) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("alertType", "PO_LINE_BLOCKED_NON_ACTIVE_SKU");
            payload.put("severity", "Warning");
            payload.put("dcId", dcId);
            payload.put("sapPoNumber", sapPoNumber);
            payload.put("blockedSkuCodes", blockedSkuCodes);
            payload.put("triggeredAt", Instant.now().toString());
            payload.put("targetRoles", List.of("Admin_User", "BnM_User"));

            String messageBody = objectMapper.writeValueAsString(payload);

            SendMessageRequest request = SendMessageRequest.builder()
                    .queueUrl(alertQueueUrl)
                    .messageBody(messageBody)
                    .build();

            sqsClient.sendMessage(request);
            logger.info("Sent blocked PO line alert for PO {} with {} blocked SKUs", sapPoNumber, blockedSkuCodes.size());
        } catch (Exception e) {
            logger.error("Failed to send blocked PO line alert for PO {}", sapPoNumber, e);
        }
    }
}
