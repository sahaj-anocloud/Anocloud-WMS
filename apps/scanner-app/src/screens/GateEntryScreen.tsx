import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

export const GateEntryScreen = ({ navigation }: any) => {
  const [vehicleNo, setVehicleNo] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [poReference, setPoReference] = useState('');

  const handleRegister = () => {
    console.log('Registering vehicle:', vehicleNo);
    navigation.navigate('DeliveryList');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={Typography.h2}>Gate Entry</Text>
        <Text style={Typography.body}>Vehicle Arrival Registration</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Vehicle Number</Text>
          <TextInput
            style={styles.input}
            value={vehicleNo}
            onChangeText={setVehicleNo}
            placeholder="e.g. MH 12 AB 1234"
            placeholderTextColor={Colors.textSecondary}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Vendor Code</Text>
          <TextInput
            style={styles.input}
            value={vendorCode}
            onChangeText={setVendorCode}
            placeholder="V-9921"
            placeholderTextColor={Colors.textSecondary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>PO / ASN Reference</Text>
          <TextInput
            style={styles.input}
            value={poReference}
            onChangeText={setPoReference}
            placeholder="Scan or Type..."
            placeholderTextColor={Colors.textSecondary}
          />
        </View>

        <TouchableOpacity style={styles.button} onPress={handleRegister}>
          <Text style={styles.buttonText}>REGISTER ARRIVAL</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
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
  form: {
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.lg,
  },
  label: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    padding: Spacing.md,
    borderRadius: 8,
    fontSize: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  buttonText: {
    ...Typography.body,
    fontWeight: '700',
  },
});
