package com.sumosave.sap.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sumosave.sap.dto.POSyncRequest;
import com.sumosave.sap.service.SapService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(SapController.class)
class SapControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockBean
    private SapService sapService;

    @Test
    void testSyncPurchaseOrder_Success() throws Exception {
        // Arrange
        POSyncRequest request = new POSyncRequest();
        request.setSapPoNumber("PO-2024-001");
        request.setDcId("DC01");
        request.setVendorCode("V001");

        POSyncRequest.POLine line = new POSyncRequest.POLine();
        line.setSkuCode("SKU001");
        line.setOrderedQty(100.0);
        line.setUnitPrice(50.0);
        line.setGstRate(18.0);

        request.setLines(List.of(line));

        doNothing().when(sapService).syncPurchaseOrder(any(POSyncRequest.class));

        // Act & Assert
        mockMvc.perform(post("/internal/sap/po-sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(request)))
                .andExpect(status().isAccepted());

        verify(sapService).syncPurchaseOrder(any(POSyncRequest.class));
    }

    @Test
    void testSyncPurchaseOrder_InvalidRequest() throws Exception {
        // Arrange - empty request body
        String invalidJson = "{}";

        // Act & Assert
        mockMvc.perform(post("/internal/sap/po-sync")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isAccepted()); // Controller accepts and delegates to service
    }
}
