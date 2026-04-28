package com.sumosave.sap.service;

import com.sumosave.sap.dto.POSyncRequest;
import com.sumosave.sap.entity.POLine;
import com.sumosave.sap.entity.PurchaseOrder;
import com.sumosave.sap.entity.SKU;
import com.sumosave.sap.entity.Vendor;
import com.sumosave.sap.repository.PurchaseOrderRepository;
import com.sumosave.sap.repository.SKURepository;
import com.sumosave.sap.repository.VendorRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SapServiceTest {

    @Mock
    private PurchaseOrderRepository purchaseOrderRepository;

    @Mock
    private VendorRepository vendorRepository;

    @Mock
    private SKURepository skuRepository;

    @Mock
    private AlertService alertService;

    @InjectMocks
    private SapService sapService;

    private Vendor testVendor;
    private SKU activeSku;
    private SKU inactiveSku;

    @BeforeEach
    void setUp() {
        testVendor = new Vendor();
        testVendor.setVendorId(UUID.randomUUID());
        testVendor.setVendorCode("V001");
        testVendor.setDcId("DC01");
        testVendor.setName("Test Vendor");
        testVendor.setComplianceStatus("Active");

        activeSku = new SKU();
        activeSku.setSkuId(UUID.randomUUID());
        activeSku.setSkuCode("SKU001");
        activeSku.setDcId("DC01");
        activeSku.setStatus("Active");

        inactiveSku = new SKU();
        inactiveSku.setSkuId(UUID.randomUUID());
        inactiveSku.setSkuCode("SKU002");
        inactiveSku.setDcId("DC01");
        inactiveSku.setStatus("Inactive");
    }

    @Test
    void testSyncPurchaseOrder_Success() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-001");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        POSyncRequest.POLine line1 = new POSyncRequest.POLine();
        line1.setSkuCode("SKU001");
        line1.setOrderedQty(100.0);
        line1.setUnitPrice(50.0);
        line1.setGstRate(18.0);

        request.setLines(List.of(line1));

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-001")).thenReturn(Optional.empty());
        when(vendorRepository.findByVendorCode("V001")).thenReturn(Optional.of(testVendor));
        when(skuRepository.findByDcIdAndSkuCode("DC01", "SKU001")).thenReturn(Optional.of(activeSku));
        when(purchaseOrderRepository.save(any(PurchaseOrder.class))).thenAnswer(i -> i.getArgument(0));

        // Act
        sapService.syncPurchaseOrder(request);

        // Assert
        ArgumentCaptor<PurchaseOrder> poCaptor = ArgumentCaptor.forClass(PurchaseOrder.class);
        verify(purchaseOrderRepository).save(poCaptor.capture());

        PurchaseOrder savedPO = poCaptor.getValue();
        assertEquals("PO-2024-001", savedPO.getSapPoNumber());
        assertEquals("DC01", savedPO.getDcId());
        assertEquals("Open", savedPO.getStatus());
        assertEquals(1, savedPO.getLines().size());

        POLine savedLine = savedPO.getLines().get(0);
        assertEquals("Open", savedLine.getStatus());
        assertEquals(new BigDecimal("100.000"), savedLine.getOrderedQty());
        assertEquals(new BigDecimal("50.0000"), savedLine.getUnitPrice());
        assertEquals(new BigDecimal("18.00"), savedLine.getGstRate());

        verify(alertService, never()).sendBlockedPOLineAlert(any(), any(), any());
    }

    @Test
    void testSyncPurchaseOrder_IdempotencyCheck() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-001");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        PurchaseOrder existingPO = new PurchaseOrder();
        existingPO.setSapPoNumber("PO-2024-001");

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-001")).thenReturn(Optional.of(existingPO));

        // Act
        sapService.syncPurchaseOrder(request);

        // Assert
        verify(purchaseOrderRepository, never()).save(any());
        verify(alertService, never()).sendBlockedPOLineAlert(any(), any(), any());
    }

    @Test
    void testSyncPurchaseOrder_BlockedLineForInactiveSKU() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-002");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        POSyncRequest.POLine line1 = new POSyncRequest.POLine();
        line1.setSkuCode("SKU002");
        line1.setOrderedQty(50.0);
        line1.setUnitPrice(30.0);
        line1.setGstRate(12.0);

        request.setLines(List.of(line1));

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-002")).thenReturn(Optional.empty());
        when(vendorRepository.findByVendorCode("V001")).thenReturn(Optional.of(testVendor));
        when(skuRepository.findByDcIdAndSkuCode("DC01", "SKU002")).thenReturn(Optional.of(inactiveSku));
        when(purchaseOrderRepository.save(any(PurchaseOrder.class))).thenAnswer(i -> i.getArgument(0));

        // Act
        sapService.syncPurchaseOrder(request);

        // Assert
        ArgumentCaptor<PurchaseOrder> poCaptor = ArgumentCaptor.forClass(PurchaseOrder.class);
        verify(purchaseOrderRepository).save(poCaptor.capture());

        PurchaseOrder savedPO = poCaptor.getValue();
        POLine savedLine = savedPO.getLines().get(0);
        assertEquals("Blocked", savedLine.getStatus());

        verify(alertService).sendBlockedPOLineAlert(eq("DC01"), eq("PO-2024-002"), eq(List.of("SKU002")));
    }

    @Test
    void testSyncPurchaseOrder_BlockedLineForNonExistentSKU() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-003");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        POSyncRequest.POLine line1 = new POSyncRequest.POLine();
        line1.setSkuCode("SKU999");
        line1.setOrderedQty(25.0);
        line1.setUnitPrice(40.0);
        line1.setGstRate(5.0);

        request.setLines(List.of(line1));

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-003")).thenReturn(Optional.empty());
        when(vendorRepository.findByVendorCode("V001")).thenReturn(Optional.of(testVendor));
        when(skuRepository.findByDcIdAndSkuCode("DC01", "SKU999")).thenReturn(Optional.empty());
        when(purchaseOrderRepository.save(any(PurchaseOrder.class))).thenAnswer(i -> i.getArgument(0));

        // Act
        sapService.syncPurchaseOrder(request);

        // Assert
        ArgumentCaptor<PurchaseOrder> poCaptor = ArgumentCaptor.forClass(PurchaseOrder.class);
        verify(purchaseOrderRepository).save(poCaptor.capture());

        PurchaseOrder savedPO = poCaptor.getValue();
        POLine savedLine = savedPO.getLines().get(0);
        assertEquals("Blocked", savedLine.getStatus());
        assertNull(savedLine.getSku());

        verify(alertService).sendBlockedPOLineAlert(eq("DC01"), eq("PO-2024-003"), eq(List.of("SKU999")));
    }

    @Test
    void testSyncPurchaseOrder_MixedActiveAndBlockedLines() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-004");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        POSyncRequest.POLine line1 = new POSyncRequest.POLine();
        line1.setSkuCode("SKU001");
        line1.setOrderedQty(100.0);
        line1.setUnitPrice(50.0);
        line1.setGstRate(18.0);

        POSyncRequest.POLine line2 = new POSyncRequest.POLine();
        line2.setSkuCode("SKU002");
        line2.setOrderedQty(50.0);
        line2.setUnitPrice(30.0);
        line2.setGstRate(12.0);

        request.setLines(List.of(line1, line2));

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-004")).thenReturn(Optional.empty());
        when(vendorRepository.findByVendorCode("V001")).thenReturn(Optional.of(testVendor));
        when(skuRepository.findByDcIdAndSkuCode("DC01", "SKU001")).thenReturn(Optional.of(activeSku));
        when(skuRepository.findByDcIdAndSkuCode("DC01", "SKU002")).thenReturn(Optional.of(inactiveSku));
        when(purchaseOrderRepository.save(any(PurchaseOrder.class))).thenAnswer(i -> i.getArgument(0));

        // Act
        sapService.syncPurchaseOrder(request);

        // Assert
        ArgumentCaptor<PurchaseOrder> poCaptor = ArgumentCaptor.forClass(PurchaseOrder.class);
        verify(purchaseOrderRepository).save(poCaptor.capture());

        PurchaseOrder savedPO = poCaptor.getValue();
        assertEquals(2, savedPO.getLines().size());
        assertEquals("Open", savedPO.getLines().get(0).getStatus());
        assertEquals("Blocked", savedPO.getLines().get(1).getStatus());

        verify(alertService).sendBlockedPOLineAlert(eq("DC01"), eq("PO-2024-004"), eq(List.of("SKU002")));
    }

    @Test
    void testSyncPurchaseOrder_VendorNotFound() {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-005");
        request.setDcId("DC01");
        request.setVendorCode("V999");
        request.setLines(List.of());

        when(purchaseOrderRepository.findBySapPoNumber("PO-2024-005")).thenReturn(Optional.empty());
        when(vendorRepository.findByVendorCode("V999")).thenReturn(Optional.empty());

        // Act & Assert
        assertThrows(IllegalArgumentException.class, () -> sapService.syncPurchaseOrder(request));
        verify(purchaseOrderRepository, never()).save(any());
    }
}
