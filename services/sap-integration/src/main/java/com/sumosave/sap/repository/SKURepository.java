package com.sumosave.sap.repository;

import com.sumosave.sap.entity.SKU;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SKURepository extends JpaRepository<SKU, UUID> {
    Optional<SKU> findByDcIdAndSkuCode(String dcId, String skuCode);
}
