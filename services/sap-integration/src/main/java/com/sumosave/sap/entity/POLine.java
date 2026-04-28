package com.sumosave.sap.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "po_lines")
public class POLine {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "po_line_id")
    private UUID poLineId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "po_id", nullable = false)
    private PurchaseOrder purchaseOrder;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sku_id", nullable = false)
    private SKU sku;

    @Column(name = "ordered_qty", nullable = false, precision = 12, scale = 3)
    private BigDecimal orderedQty;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 4)
    private BigDecimal unitPrice;

    @Column(name = "gst_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal gstRate;

    @Column(name = "received_qty", nullable = false, precision = 12, scale = 3)
    private BigDecimal receivedQty;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    // Constructors
    public POLine() {}

    // Getters and Setters
    public UUID getPoLineId() { return poLineId; }
    public void setPoLineId(UUID poLineId) { this.poLineId = poLineId; }

    public PurchaseOrder getPurchaseOrder() { return purchaseOrder; }
    public void setPurchaseOrder(PurchaseOrder purchaseOrder) { this.purchaseOrder = purchaseOrder; }

    public SKU getSku() { return sku; }
    public void setSku(SKU sku) { this.sku = sku; }

    public BigDecimal getOrderedQty() { return orderedQty; }
    public void setOrderedQty(BigDecimal orderedQty) { this.orderedQty = orderedQty; }

    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }

    public BigDecimal getGstRate() { return gstRate; }
    public void setGstRate(BigDecimal gstRate) { this.gstRate = gstRate; }

    public BigDecimal getReceivedQty() { return receivedQty; }
    public void setReceivedQty(BigDecimal receivedQty) { this.receivedQty = receivedQty; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
