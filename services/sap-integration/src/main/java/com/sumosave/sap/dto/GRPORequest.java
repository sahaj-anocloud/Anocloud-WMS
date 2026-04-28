package com.sumosave.sap.dto;

import java.time.Instant;
import java.util.List;

/**
 * Payload for posting a Goods Receipt PO (GRPO) to SAP.
 */
public class GRPORequest {

    private String          deliveryId;
    private String          sapPoNumber;
    private String          dcId;
    private Instant         postingDate;
    private List<GRPOLine>  lines;

    public GRPORequest() {}

    public String getDeliveryId() { return deliveryId; }
    public void setDeliveryId(String deliveryId) { this.deliveryId = deliveryId; }

    public String getSapPoNumber() { return sapPoNumber; }
    public void setSapPoNumber(String sapPoNumber) { this.sapPoNumber = sapPoNumber; }

    public String getDcId() { return dcId; }
    public void setDcId(String dcId) { this.dcId = dcId; }

    public Instant getPostingDate() { return postingDate; }
    public void setPostingDate(Instant postingDate) { this.postingDate = postingDate; }

    public List<GRPOLine> getLines() { return lines; }
    public void setLines(List<GRPOLine> lines) { this.lines = lines; }

    public static class GRPOLine {
        private String skuCode;
        private double receivedQty;
        private double unitCost;
        private String batchNumber;
        private String expiryDate;  // ISO date string YYYY-MM-DD

        public GRPOLine() {}

        public String getSkuCode() { return skuCode; }
        public void setSkuCode(String skuCode) { this.skuCode = skuCode; }

        public double getReceivedQty() { return receivedQty; }
        public void setReceivedQty(double receivedQty) { this.receivedQty = receivedQty; }

        public double getUnitCost() { return unitCost; }
        public void setUnitCost(double unitCost) { this.unitCost = unitCost; }

        public String getBatchNumber() { return batchNumber; }
        public void setBatchNumber(String batchNumber) { this.batchNumber = batchNumber; }

        public String getExpiryDate() { return expiryDate; }
        public void setExpiryDate(String expiryDate) { this.expiryDate = expiryDate; }
    }
}
