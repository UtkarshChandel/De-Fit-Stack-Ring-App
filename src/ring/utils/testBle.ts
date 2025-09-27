/**
 * Test BLE Module
 * Simple test to verify BLE module is working
 */

import { ringBleModule } from '../ring/bluetooth/BleModule';

export async function testBleModule(): Promise<void> {
  console.log('🧪 Testing BLE Module...');
  
  try {
    // Test 1: Check if Bluetooth is enabled
    const isEnabled = await ringBleModule.isBluetoothEnabled();
    console.log('✅ Bluetooth enabled:', isEnabled);
    
    // Test 2: Set callbacks
    ringBleModule.setOnDiscovery((device) => {
      console.log('✅ Discovery callback works:', device.name);
    });
    
    ringBleModule.setOnConnection(() => {
      console.log('✅ Connection callback works');
    });
    
    ringBleModule.setOnDisconnection(() => {
      console.log('✅ Disconnection callback works');
    });
    
    ringBleModule.setOnNotification((data) => {
      console.log('✅ Notification callback works');
    });
    
    console.log('✅ All callbacks set successfully');
    
    // Test 3: Try a quick scan
    console.log('🔍 Starting test scan for 3 seconds...');
    
    await ringBleModule.startScan({
      serviceUUIDs: ['0000fef5-0000-1000-8000-00805f9b34fb']
    });
    
    setTimeout(async () => {
      await ringBleModule.stopScan();
      console.log('✅ Scan stopped');
    }, 3000);
    
  } catch (error) {
    console.error('❌ BLE test failed:', error);
  }
}