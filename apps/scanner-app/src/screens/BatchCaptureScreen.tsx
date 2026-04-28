import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

export const BatchCaptureScreen = ({ route, navigation }: any) => {
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');

  const handleSave = () => {
    console.log('Saving batch:', batch, 'Expiry:', expiry);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={Typography.h2}>Batch Capture</Text>
        <Text style={Typography.body}>Premium Basmati Rice 5kg</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Batch Number</Text>
          <TextInput
            style={styles.input}
            value={batch}
            onChangeText={setBatch}
            placeholder="e.g. B-2026-X1"
            placeholderTextColor={Colors.textSecondary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Expiry Date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={expiry}
            onChangeText={setExpiry}
            placeholder="2027-12-31"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
          />
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>SAVE BATCH DATA</Text>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  form: {
    padding: Spacing.lg,
  },
  field: {
    marginBottom: Spacing.xl,
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
  saveButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  saveButtonText: {
    ...Typography.body,
    fontWeight: '700',
    letterSpacing: 1,
  },
});
