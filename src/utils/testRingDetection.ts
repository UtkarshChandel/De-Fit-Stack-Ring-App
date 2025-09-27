/**
 * Test script for Ring device detection
 * This script helps validate that we're correctly detecting SR09_ Ring devices
 * and ignoring SR09WC chargers
 */

import { BleManager } from 'react-native-ble-plx';

const manager = new BleManager();

// Ring service UUID
const RING_SERVICE_UUID = '0000fef5-0000-1000-8000-00805f9b34fb';

export async function testRingDetection() {
  console.log('🔍 Starting Ring device detection test...');
  console.log('----------------------------------------');
  
  const devices = new Map();
  
  try {
    // Start scanning
    manager.startDeviceScan(
      [RING_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          console.error('❌ Scan error:', error);
          return;
        }
        
        if (device && device.name && !devices.has(device.id)) {
          const deviceName = device.name.toUpperCase();
          
          // Categorize device
          let deviceType = 'Unknown';
          let shouldConnect = false;
          
          if (deviceName === 'SR09WC' || deviceName.includes('SR09WC')) {
            deviceType = '🔌 Ring Charger';
            shouldConnect = false;
          } else if (deviceName.startsWith('SR09_')) {
            deviceType = '💍 Smart Ring';
            shouldConnect = true;
          } else if (deviceName.includes('SR09')) {
            deviceType = '❓ Other SR09 Device';
            shouldConnect = false;
          }
          
          devices.set(device.id, {
            name: device.name,
            id: device.id,
            rssi: device.rssi,
            type: deviceType,
            shouldConnect
          });
          
          console.log(`\nFound: ${deviceType}`);
          console.log(`  Name: ${device.name}`);
          console.log(`  ID: ${device.id}`);
          console.log(`  RSSI: ${device.rssi} dBm`);
          console.log(`  Connect: ${shouldConnect ? '✅ YES' : '❌ NO'}`);
        }
      }
    );
    
    // Scan for 10 seconds
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Stop scanning
    manager.stopDeviceScan();
    
    console.log('\n========================================');
    console.log('📊 SCAN RESULTS SUMMARY');
    console.log('========================================');
    
    const ringDevices = Array.from(devices.values()).filter(d => d.shouldConnect);
    const chargers = Array.from(devices.values()).filter(d => d.type.includes('Charger'));
    const others = Array.from(devices.values()).filter(d => d.type.includes('Other'));
    
    console.log(`\n💍 Smart Rings Found: ${ringDevices.length}`);
    ringDevices.forEach(d => {
      console.log(`   - ${d.name} (${d.id})`);
    });
    
    console.log(`\n🔌 Chargers Found: ${chargers.length}`);
    chargers.forEach(d => {
      console.log(`   - ${d.name} (${d.id})`);
    });
    
    console.log(`\n❓ Other Devices: ${others.length}`);
    others.forEach(d => {
      console.log(`   - ${d.name} (${d.id})`);
    });
    
    console.log('\n========================================');
    
    if (ringDevices.length > 0) {
      console.log('✅ SUCCESS: Found Smart Ring devices to connect to!');
      console.log('The app should connect to:', ringDevices[0].name);
    } else if (chargers.length > 0) {
      console.log('⚠️ WARNING: Only found chargers, no Ring devices');
      console.log('Make sure your Ring (SR09_xxxx) is powered on');
    } else {
      console.log('❌ ERROR: No Ring devices found at all');
      console.log('Check that Bluetooth is enabled and Ring is nearby');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Export for use in other files
export default testRingDetection;