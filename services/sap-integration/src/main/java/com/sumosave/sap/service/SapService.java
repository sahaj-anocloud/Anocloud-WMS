package com.sumosave.sap.service;

import com.sumosave.sap.dto.GRPORequest;
import com.sumosave.sap.dto.GRPOResponse;
import com.sumosave.sap.dto.POSyncRequest;
import com.sumosave.sap.entity.POLine;
import com.sumosave.sap.entity.PurchaseOrder;
import com.sumosave.sap.entity.SKU;
import com.sumosave.sap.entity.Vendor;
import com.sumosave.sap.repository.PurchaseOrderRepository;
import com.sumosave.sap.repository.SKURepository;
import com.sumosave.sap.repository.VendorRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Service for SAP integration.
 * Handles PO sync, GRPO posting, and stock reconciliation.
 */
@Service
public class SapService {

    private static final Logger logger = LoggerFactory.getLogger(SapService.class);

    private final PurchaseOrderRepository purchaseOrderRepository;
    private final VendorRepository vendorRepository;
    private final SKURepository skuRepository;
    private final AlertService alertService;

    public SapService(
            PurchaseOrderRepository purchaseOrderRepository,
            VendorRepository vendorRepository,
            SKURepository skuRepository,
            AlertService alertService) {
        this.purchaseOrderRepository = purchaseOrderRepository;
        this.vendorRepository = vendorRepository;
        this.skuRepository = skuRepository;
        this.alertService = alertService;
    }

    /**
     * Sync a Purchase Order from SAP into the WMS.
     * Implements idempotency by checking sap_po_number.
     * Flags PO lines referencing non-Active SKUs as Blocked.
     * Sends alerts for blocked lines.
     */
    @Transactional
    public void syncPurchaseOrder(POSyncRequest request) {
        logger.info("Processing PO sync for SAP PO number: {}", request.getSapPoNumber());

        // Idempotency check: if PO already exists, ignore duplicate
        Optional<PurchaseOrder> existingPO = purchaseOrderRepository.findBySapPoNumber(request.getSapPoNumber());
        if (existingPO.isPresent()) {
            logger.info("PO {} already exists. Ignoring duplicate sync request.", request.getSapPoNumber());
            return;
        }

        // Validate vendor exists
        Vendor vendor = vendorRepository.findByVendorCode(request.getVendorCode())
                .orElseThrow(() -> new IllegalArgumentException(
                        "Vendor not found: " + request.getVendorCode()));

        // Create PurchaseOrder entity
        PurchaseOrder po = new PurchaseOrder();
        po.setDcId(request.getDcId());
        po.setSapPoNumber(request.getSapPoNumber());
        po.setVendor(vendor);
        po.setStatus("Open");
        po.setCreatedAt(Instant.now());
        po.setSapSyncedAt(Instant.now());

        List<String> blockedSkuCodes = new ArrayList<>();

        // Process PO lines
        for (POSyncRequest.POLine lineRequest : request.getLines()) {
            Optional<SKU> skuOpt = skuRepository.findByDcIdAndSkuCode(request.getDcId(), lineRequest.getSkuCode());

            POLine line = new POLine();
            line.setOrderedQty(BigDecimal.valueOf(lineRequest.getOrderedQty()));
            line.setUnitPrice(BigDecimal.valueOf(lineRequest.getUnitPrice()));
            line.setGstRate(BigDecimal.valueOf(lineRequest.getGstRate()));
            line.setReceivedQty(BigDecimal.ZERO);

            // Check if SKU exists and is Active
            if (skuOpt.isEmpty() || !"Active".equals(skuOpt.get().getStatus())) {
                // Flag line as Blocked if SKU is not Active
                line.setStatus("Blocked");
                blockedSkuCodes.add(lineRequest.getSkuCode());
                logger.warn("PO line for SKU {} flagged as Blocked (SKU not Active)", lineRequest.getSkuCode());

                // Set SKU reference if it exists (even if not Active)
                skuOpt.ifPresent(line::setSku);
            } else {
                // SKU is Active, set status to Open
                line.setStatus("Open");
                line.setSku(skuOpt.get());
            }

            po.addLine(line);
        }

        // Save PurchaseOrder with lines
        purchaseOrderRepository.save(po);
        logger.info("Successfully synced PO {} with {} lines ({} blocked)",
                request.getSapPoNumber(), request.getLines().size(), blockedSkuCodes.size());

        // Send alert if any lines are blocked
        if (!blockedSkuCodes.isEmpty()) {
            alertService.sendBlockedPOLineAlert(request.getDcId(), request.getSapPoNumber(), blockedSkuCodes);
        }
    }

    /**
     * Post a Goods Receipt PO to SAP.
     *
     * Retry schedule (exponential backoff):
     *   Attempt 1 -> 5 s -> Attempt 2 -> 15 s -> Attempt 3 -> 45 s -> Attempt 4 -> give up
     *
     * On exhaustion a SAP_GRPO_FAILURE alert must be raised by the caller.
     */
    @Retryable(
        retryFor  = Exception.class,
        maxAttempts = 4,
        backoff = @Backoff(delay = 5_000L, multiplier = 3.0, maxDelay = 120_000L)
    )
    public GRPOResponse postGRPO(GRPORequest request) {
        logger.info("Mocking SAP BAPI_GOODSMVT_CREATE for delivery: {}", request.getDeliveryId());
        
        // Simulate a successful SAP response with a generated GRPO document number
        String mockGrpoDocNumber = "GRPO-" + System.currentTimeMillis();
        
        logger.info("Successfully posted GRPO to SAP. Doc number: {}", mockGrpoDocNumber);
        return new GRPOResponse(mockGrpoDocNumber, request.getDeliveryId(), "SUCCESS", Instant.now());
    }

    /**
     * Fetch current stock levels from SAP for reconciliation.
     */
    public Map<String, Double> getStockLevels(String dcId) {
        logger.info("Mocking SAP stock query via JCo connector for DC: {}", dcId);
        
        // Simulate returning mock stock data for some known SKUs
        return Map.of(
            "SKU-1001", 150.0,
            "SKU-1002", 75.0,
            "SKU-1003", 0.0
        );
    }
}
