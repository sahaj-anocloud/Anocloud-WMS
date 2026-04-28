import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';
import { OfflineSyncService } from '../services/sync.service';

export const LPNPrintScreen = ({ navigation }: any) => {
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await OfflineSyncService.enqueue({
        txn_type: 'PRINT_LPN',
        payload: { 
          sku_id: '22222222-2222-2222-2222-222222222222', // Hardcoded SKU-001 for demo
          batch_number: 'B-101',
          expiry_date: '2027-12-01',
          printer_host: '10.0.0.99' // Target Zebra ZT411
        },
        dc_id: 'DC-001',
        user_id: 'USR-101',
        device_id: 'DEV-992',
      });
    } catch (err) {
      console.error('Failed to queue print request', err);
    } finally {
      setPrinting(false);
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={Typography.h2}>Print LPN Label</Text>
        <Text style={Typography.body}>Target: Zebra ZT411 (Dock 4)</Text>
      </View>

      <View style={styles.preview}>
        <View style={styles.labelDraft}>
          <Text style={styles.labelTitle}>SUMOSAVE LPN</Text>
          <Text style={styles.lpnId}>LPN-99281-X</Text>
          <View style={styles.barcodePlaceholder} />
          <Text style={styles.skuName}>Premium Basmati Rice 5kg</Text>
          <View style={styles.labelMeta}>
            <Text style={styles.metaText}>Batch: B-101</Text>
            <Text style={styles.metaText}>Exp: 2027-12</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity 
          style={[styles.printButton, printing && styles.disabledButton]} 
          onPress={handlePrint}
          disabled={printing}
        >
          <Text style={styles.printButtonText}>{printing ? 'PRINTING...' : 'CONFIRM & PRINT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
  },
  preview: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  labelDraft: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    aspectRatio: 1.5,
    padding: Spacing.md,
    borderRadius: 4,
    alignItems: 'center',
  },
  labelTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000000',
  },
  lpnId: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    marginVertical: Spacing.xs,
  },
  barcodePlaceholder: {
    width: '80%',
    height: 40,
    backgroundColor: '#000000',
    marginVertical: Spacing.sm,
  },
  skuName: {
    fontSize: 12,
    color: '#000000',
    textAlign: 'center',
  },
  labelMeta: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  metaText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#000000',
  },
  footer: {
    padding: Spacing.lg,
  },
  printButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: Colors.border,
  },
  printButtonText: {
    ...Typography.body,
    fontWeight: '700',
  },
});
