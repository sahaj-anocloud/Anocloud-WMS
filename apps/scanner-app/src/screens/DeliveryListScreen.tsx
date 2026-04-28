import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

interface Delivery {
  id: string;
  poNumber: string;
  vendorName: string;
  itemCount: number;
  status: 'Inbound' | 'Unloading' | 'Completed';
}

const DUMMY_DELIVERIES: Delivery[] = [
  { id: '1', poNumber: 'PO-88291', vendorName: 'Global Mart India', itemCount: 12, status: 'Inbound' },
  { id: '2', poNumber: 'PO-88295', vendorName: 'FMCG Staples Ltd', itemCount: 4, status: 'Unloading' },
  { id: '3', poNumber: 'PO-88301', vendorName: 'Agro Fresh Co', itemCount: 8, status: 'Inbound' },
];

export const DeliveryListScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <FlatList
        data={DUMMY_DELIVERIES}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={styles.card}
            onPress={() => navigation.navigate('ScanLine', { deliveryId: item.id })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.poText}>{item.poNumber}</Text>
              <View style={[styles.badge, { backgroundColor: item.status === 'Unloading' ? Colors.accent : Colors.surface }]}>
                <Text style={[styles.badgeText, { color: item.status === 'Unloading' ? Colors.secondary : Colors.textSecondary }]}>
                  {item.status.toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={styles.vendorText}>{item.vendorName}</Text>
            <Text style={Typography.caption}>{item.itemCount} items scheduled</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  listContent: {
    padding: Spacing.md,
  },
  card: {
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    borderRadius: 12,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  poText: {
    ...Typography.h2,
    color: Colors.primary,
  },
  vendorText: {
    ...Typography.body,
    fontWeight: 'bold',
    marginBottom: Spacing.xs,
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
});
