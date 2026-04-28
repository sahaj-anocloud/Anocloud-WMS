package com.sumosave.sap.controller;

import com.sumosave.sap.dto.GRPORequest;
import com.sumosave.sap.dto.GRPOResponse;
import com.sumosave.sap.dto.POSyncRequest;
import com.sumosave.sap.service.SapService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Internal REST endpoints for SAP integration.
 * All paths are prefixed with /internal/sap and are not exposed externally.
 */
@RestController
@RequestMapping("/internal/sap")
public class SapController {

    private final SapService sapService;

    public SapController(SapService sapService) {
        this.sapService = sapService;
    }

    /**
     * POST /internal/sap/po-sync
     * Trigger a PO sync from SAP into the WMS.
     */
    @PostMapping("/po-sync")
    public ResponseEntity<Void> syncPurchaseOrder(@RequestBody POSyncRequest request) {
        sapService.syncPurchaseOrder(request);
        return ResponseEntity.accepted().build();
    }

    /**
     * POST /internal/sap/grpo
     * Post a Goods Receipt PO to SAP (with retry).
     */
    @PostMapping("/grpo")
    public ResponseEntity<GRPOResponse> postGRPO(@RequestBody GRPORequest request) {
        GRPOResponse response = sapService.postGRPO(request);
        return ResponseEntity.ok(response);
    }

    /**
     * GET /internal/sap/stock?dcId={dcId}
     * Fetch current stock levels from SAP for reconciliation.
     */
    @GetMapping("/stock")
    public ResponseEntity<Map<String, Double>> getStock(@RequestParam String dcId) {
        Map<String, Double> stock = sapService.getStockLevels(dcId);
        return ResponseEntity.ok(stock);
    }
}
