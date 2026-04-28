package com.sumosave.sap.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "purchase_orders")
public class PurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "po_id")
    private UUID poId;

    @Column(name = "dc_id", nullable = false, length = 20)
    private String dcId;

    @Column(name = "sap_po_number", nullable = false, unique = true, length = 50)
    private String sapPoNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vendor_id", nullable = false)
    private Vendor vendor;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "sap_synced_at")
    private Instant sapSyncedAt;

    @OneToMany(mappedBy = "purchaseOrder", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<POLine> lines = new ArrayList<>();

    // Constructors
    public PurchaseOrder() {}

    // Getters and Setters
    public UUID getPoId() { return poId; }
    public void setPoId(UUID poId) { this.poId = poId; }

    public String getDcId() { return dcId; }
    public void setDcId(String dcId) { this.dcId = dcId; }

    public String getSapPoNumber() { return sapPoNumber; }
    public void setSapPoNumber(String sapPoNumber) { this.sapPoNumber = sapPoNumber; }

    public Vendor getVendor() { return vendor; }
    public void setVendor(Vendor vendor) { this.vendor = vendor; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getSapSyncedAt() { return sapSyncedAt; }
    public void setSapSyncedAt(Instant sapSyncedAt) { this.sapSyncedAt = sapSyncedAt; }

    public List<POLine> getLines() { return lines; }
    public void setLines(List<POLine> lines) { this.lines = lines; }

    public void addLine(POLine line) {
        lines.add(line);
        line.setPurchaseOrder(this);
    }
}
