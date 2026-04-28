import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { LoginScreen } from '../screens/LoginScreen';
import { GateEntryScreen } from '../screens/GateEntryScreen';
import { DeliveryListScreen } from '../screens/DeliveryListScreen';
import { ScanScreen } from '../screens/ScanScreen';
import { BatchCaptureScreen } from '../screens/BatchCaptureScreen';
import { QuarantineScreen } from '../screens/QuarantineScreen';
import { LPNPrintScreen } from '../screens/LPNPrintScreen';
import { Colors } from '../theme';

const Stack = createStackNavigator<RootStackParamList>();

export const AppNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Login"
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: Colors.border,
        },
        headerTintColor: Colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
        cardStyle: { backgroundColor: Colors.background },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen} 
        options={{ headerShown: false }} 
      />
      <Stack.Screen 
        name="GateEntry" 
        component={GateEntryScreen} 
        options={{ title: 'VEHICLE ARRIVAL' }} 
      />
      <Stack.Screen 
        name="DeliveryList" 
        component={DeliveryListScreen} 
        options={{ title: 'INBOUND DELIVERIES' }} 
      />
      <Stack.Screen 
        name="ScanLine" 
        component={ScanScreen} 
        options={{ title: 'SCANNING' }} 
      />
      <Stack.Screen 
        name="BatchCapture" 
        component={BatchCaptureScreen} 
        options={{ title: 'BATCH DATA' }} 
      />
      <Stack.Screen 
        name="Quarantine" 
        component={QuarantineScreen} 
        options={{ title: 'QUARANTINE' }} 
      />
      <Stack.Screen 
        name="LPNPrint" 
        component={LPNPrintScreen} 
        options={{ title: 'PRINT LABEL' }} 
      />
    </Stack.Navigator>
  );
};
