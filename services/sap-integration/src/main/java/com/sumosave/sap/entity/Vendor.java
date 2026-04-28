package com.sumosave.sap.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "vendors")
public class Vendor {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "vendor_id")
    private UUID vendorId;

    @Column(name = "dc_id", nullable = false, length = 20)
    private String dcId;

    @Column(name = "vendor_code", nullable = false, unique = true, length = 50)
    private String vendorCode;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "gstin", nullable = false, length = 15)
    private String gstin;

    @Column(name = "compliance_status", nullable = false, length = 20)
    private String complianceStatus;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    // Constructors
    public Vendor() {}

    // Getters and Setters
    public UUID getVendorId() { return vendorId; }
    public void setVendorId(UUID vendorId) { this.vendorId = vendorId; }

    public String getDcId() { return dcId; }
    public void setDcId(String dcId) { this.dcId = dcId; }

    public String getVendorCode() { return vendorCode; }
    public void setVendorCode(String vendorCode) { this.vendorCode = vendorCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getGstin() { return gstin; }
    public void setGstin(String gstin) { this.gstin = gstin; }

    public String getComplianceStatus() { return complianceStatus; }
    public void setComplianceStatus(String complianceStatus) { this.complianceStatus = complianceStatus; }

    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
