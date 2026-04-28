package com.sumosave.sap.dto;

import java.time.Instant;

/**
 * Response returned after a GRPO is posted to SAP.
 */
public class GRPOResponse {

    private String  grpoDocNumber;
    private String  deliveryId;
    private String  status;          // SUCCESS | FAILED | PENDING
    private String  errorMessage;
    private Instant postedAt;

    public GRPOResponse() {}

    public GRPOResponse(String grpoDocNumber, String deliveryId, String status, Instant postedAt) {
        this.grpoDocNumber = grpoDocNumber;
        this.deliveryId    = deliveryId;
        this.status        = status;
        this.postedAt      = postedAt;
    }

    public String getGrpoDocNumber() { return grpoDocNumber; }
    public void setGrpoDocNumber(String grpoDocNumber) { this.grpoDocNumber = grpoDocNumber; }

    public String getDeliveryId() { return deliveryId; }
    public void setDeliveryId(String deliveryId) { this.deliveryId = deliveryId; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }

    public Instant getPostedAt() { return postedAt; }
    public void setPostedAt(Instant postedAt) { this.postedAt = postedAt; }
}
