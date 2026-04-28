import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { Colors, Spacing, Typography } from '../theme';

import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../types';

export const LoginScreen = () => {
  const [otp, setOtp] = useState('');
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();

  const handleLogin = () => {
    console.log('Logging in with OTP:', otp);
    navigation.navigate('GateEntry');
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={Typography.h1}>SumoSave</Text>
          <Text style={[Typography.body, { color: Colors.primary }]}>WMS Scanner</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Shift Access OTP</Text>
          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            placeholder="Enter 6-digit OTP"
            placeholderTextColor={Colors.textSecondary}
            keyboardType="number-pad"
            maxLength={6}
          />

          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>START SHIFT</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={Typography.caption}>Version 1.0.0 (BETA)</Text>
          <Text style={Typography.caption}>Device ID: SCAN-992-X</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl * 2,
  },
  form: {
    width: '100%',
  },
  label: {
    ...Typography.body,
    marginBottom: Spacing.sm,
    color: Colors.textSecondary,
  },
  input: {
    backgroundColor: Colors.surface,
    color: Colors.text,
    padding: Spacing.md,
    borderRadius: 8,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  button: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: 8,
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  buttonText: {
    ...Typography.body,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  footer: {
    position: 'absolute',
    bottom: Spacing.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
});
