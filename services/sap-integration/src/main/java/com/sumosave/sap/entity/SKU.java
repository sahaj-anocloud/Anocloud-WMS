package com.sumosave.sap.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "skus")
public class SKU {

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Column(name = "sku_id")
    private UUID skuId;

    @Column(name = "dc_id", nullable = false, length = 20)
    private String dcId;

    @Column(name = "sku_code", nullable = false, length = 50)
    private String skuCode;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "category", nullable = false, length = 50)
    private String category;

    @Column(name = "packaging_class", nullable = false, length = 30)
    private String packagingClass;

    @Column(name = "is_ft", nullable = false)
    private Boolean isFt;

    @Column(name = "is_perishable", nullable = false)
    private Boolean isPerishable;

    @Column(name = "requires_cold", nullable = false)
    private Boolean requiresCold;

    @Column(name = "gst_rate", nullable = false, precision = 5, scale = 2)
    private BigDecimal gstRate;

    @Column(name = "mrp", nullable = false, precision = 12, scale = 2)
    private BigDecimal mrp;

    @Column(name = "length_mm", precision = 8, scale = 2)
    private BigDecimal lengthMm;

    @Column(name = "width_mm", precision = 8, scale = 2)
    private BigDecimal widthMm;

    @Column(name = "height_mm", precision = 8, scale = 2)
    private BigDecimal heightMm;

    @Column(name = "weight_g", precision = 10, scale = 3)
    private BigDecimal weightG;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    // Constructors
    public SKU() {}

    // Getters and Setters
    public UUID getSkuId() { return skuId; }
    public void setSkuId(UUID skuId) { this.skuId = skuId; }

    public String getDcId() { return dcId; }
    public void setDcId(String dcId) { this.dcId = dcId; }

    public String getSkuCode() { return skuCode; }
    public void setSkuCode(String skuCode) { this.skuCode = skuCode; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getPackagingClass() { return packagingClass; }
    public void setPackagingClass(String packagingClass) { this.packagingClass = packagingClass; }

    public Boolean getIsFt() { return isFt; }
    public void setIsFt(Boolean isFt) { this.isFt = isFt; }

    public Boolean getIsPerishable() { return isPerishable; }
    public void setIsPerishable(Boolean isPerishable) { this.isPerishable = isPerishable; }

    public Boolean getRequiresCold() { return requiresCold; }
    public void setRequiresCold(Boolean requiresCold) { this.requiresCold = requiresCold; }

    public BigDecimal getGstRate() { return gstRate; }
    public void setGstRate(BigDecimal gstRate) { this.gstRate = gstRate; }

    public BigDecimal getMrp() { return mrp; }
    public void setMrp(BigDecimal mrp) { this.mrp = mrp; }

    public BigDecimal getLengthMm() { return lengthMm; }
    public void setLengthMm(BigDecimal lengthMm) { this.lengthMm = lengthMm; }

    public BigDecimal getWidthMm() { return widthMm; }
    public void setWidthMm(BigDecimal widthMm) { this.widthMm = widthMm; }

    public BigDecimal getHeightMm() { return heightMm; }
    public void setHeightMm(BigDecimal heightMm) { this.heightMm = heightMm; }

    public BigDecimal getWeightG() { return weightG; }
    public void setWeightG(BigDecimal weightG) { this.weightG = weightG; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
