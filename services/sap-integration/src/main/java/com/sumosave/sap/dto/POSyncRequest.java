package com.sumosave.sap.dto;

import java.util.List;

/**
 * Payload for syncing a Purchase Order from SAP into the WMS.
 */
public class POSyncRequest {

    private String       sapPoNumber;
    private String       dcId;
    private String       vendorCode;
    private List<POLine> lines;

    public POSyncRequest() {}

    public String getSapPoNumber() { return sapPoNumber; }
    public void setSapPoNumber(String sapPoNumber) { this.sapPoNumber = sapPoNumber; }

    public String getDcId() { return dcId; }
    public void setDcId(String dcId) { this.dcId = dcId; }

    public String getVendorCode() { return vendorCode; }
    public void setVendorCode(String vendorCode) { this.vendorCode = vendorCode; }

    public List<POLine> getLines() { return lines; }
    public void setLines(List<POLine> lines) { this.lines = lines; }

    public static class POLine {
        private String  skuCode;
        private double  orderedQty;
        private double  unitPrice;
        private double  gstRate;

        public POLine() {}

        public String getSkuCode() { return skuCode; }
        public void setSkuCode(String skuCode) { this.skuCode = skuCode; }

        public double getOrderedQty() { return orderedQty; }
        public void setOrderedQty(double orderedQty) { this.orderedQty = orderedQty; }

        public double getUnitPrice() { return unitPrice; }
        public void setUnitPrice(double unitPrice) { this.unitPrice = unitPrice; }

        public double getGstRate() { return gstRate; }
        public void setGstRate(double gstRate) { this.gstRate = gstRate; }
    }
}
