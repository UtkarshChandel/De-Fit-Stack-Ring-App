/**
 * Ring Connection Screen
 * Basic UI for discovering and connecting to Ring devices
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatRingColor,
  formatRingSize,
} from "../../src/ring/data/formatters/dataFormatters";
import { useRingSetup } from "../../src/ring/device/ringSetup";
import { ringService } from "../../src/ring/RingService";
import { useRingStore } from "../../src/ring/state/ringStore";
import { SmartRingX1 } from "../../src/types/ring";

interface RingConnectionScreenProps {
  onConnectionSuccess: (ring: SmartRingX1) => void;
}

export default function RingConnectionScreen({
  onConnectionSuccess,
}: RingConnectionScreenProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [bleError, setBleError] = useState<string | null>(null);

  // Hook must be called unconditionally
  const ringSetup = useRingSetup();

  const {
    isScanning = false,
    discoveredDevices = [],
    connectionError,
    isConnected = false,
    connectedRing,
    startScan = async () => {
      throw new Error("BLE not initialized");
    },
    stopScan = async () => {},
    connectToRing = async () => {
      throw new Error("BLE not initialized");
    },
    disconnectFromRing = async () => {},
  } = ringSetup || {};

  const { connectionStatus } = useRingStore();

  useEffect(() => {
    initializeService();
  }, []);

  useEffect(() => {
    console.log('🔍 RingConnectionScreen - Connection state changed:', {
      isConnected,
      connectedRing: connectedRing ? { id: connectedRing.id, name: connectedRing.name } : null
    });
    if (isConnected && connectedRing) {
      console.log('✅ Connection successful! Calling onConnectionSuccess...');
      onConnectionSuccess(connectedRing);
    }
  }, [isConnected, connectedRing]);

  const initializeService = async () => {
    try {
      await ringService.initialize();
      setIsInitialized(true);
    } catch (error) {
      console.error("Failed to initialize Ring service:", error);
      Alert.alert("Initialization Error", "Failed to initialize Ring service");
    }
  };

  const handleStartScan = async () => {
    try {
      await startScan();
    } catch (error) {
      console.error("Scan failed:", error);
      Alert.alert("Scan Error", "Failed to start scanning for Ring devices");
    }
  };

  const handleConnectToRing = async (deviceId: string) => {
    try {
      await connectToRing(deviceId);
    } catch (error) {
      console.error("Connection failed:", error);

      // Check if we have retry information in the connection status
      const { connectionStatus } = useRingStore.getState();
      const errorMessage =
        connectionStatus.connectionError ||
        "Unable to connect to the Ring device after multiple attempts. The device may have moved out of range or is busy.";

      Alert.alert(
        "Connection Failed",
        `${errorMessage}\n\nTips:\n• Make sure the Ring is close to your phone\n• Ensure the Ring is charged\n• Try scanning again to find nearby devices\n• Check that no other app is connected to the Ring`,
        [{ text: "OK", style: "default" }]
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectFromRing();
    } catch (error) {
      console.error("Disconnect failed:", error);
      Alert.alert("Disconnect Error", "Failed to disconnect from Ring device");
    }
  };

  const renderRingDevice = ({ item }: { item: SmartRingX1 }) => (
    <View style={styles.deviceCard}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{item.name}</Text>
        <Text style={styles.deviceDetails}>
          {formatRingColor(item.color)} • {formatRingSize(item.size)}
        </Text>
        <Text style={styles.deviceId}>ID: {item.id}</Text>
        <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.connectButton,
          connectionStatus.isConnecting && connectionStatus.deviceId === item.id
            ? styles.connectingButton
            : styles.availableButton,
        ]}
        onPress={() => handleConnectToRing(item.id)}
        disabled={connectionStatus.isConnecting}
      >
        {connectionStatus.isConnecting &&
        connectionStatus.deviceId === item.id ? (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            {connectionStatus.retryMessage && (
              <Text style={styles.retryText}>
                {connectionStatus.retryMessage}
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.connectButtonText}>Connect</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderConnectedDevice = () => (
    <View style={styles.connectedCard}>
      <Text style={styles.connectedTitle}>Connected Ring Device</Text>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{connectedRing?.name}</Text>
        <Text style={styles.deviceDetails}>
          {formatRingColor(connectedRing?.color || 0)} •{" "}
          {formatRingSize(connectedRing?.size || 7)}
        </Text>
        <Text style={styles.deviceId}>ID: {connectedRing?.id}</Text>
      </View>

      <TouchableOpacity
        style={styles.disconnectButton}
        onPress={handleDisconnect}
      >
        <Text style={styles.disconnectButtonText}>Disconnect</Text>
      </TouchableOpacity>
    </View>
  );

  if (!isInitialized) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Initializing Ring Service...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SmartRing X1 Connection</Text>
        <Text style={styles.subtitle}>
          {isConnected
            ? "Your Ring is connected and ready to use"
            : "Discover and connect to your SmartRing X1 device"}
        </Text>
      </View>

      {bleError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            ⚠️ Bluetooth not available: {bleError}
          </Text>
          <Text style={styles.errorSubText}>
            Please ensure your device supports Bluetooth
          </Text>
        </View>
      )}

      {connectionError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {connectionError}</Text>
          <TouchableOpacity
            style={styles.errorActionButton}
            onPress={() => {
              if (!isScanning) {
                handleStartScan();
              }
            }}
          >
            <Text style={styles.errorActionText}>
              {isScanning ? "Scanning for devices..." : "Scan Again"}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {isConnected ? (
        renderConnectedDevice()
      ) : (
        <>
          <View style={styles.scanSection}>
            <TouchableOpacity
              style={[
                styles.scanButton,
                isScanning && styles.scanningButton,
                (bleError || !isInitialized) && styles.disabledButton,
              ]}
              onPress={isScanning ? stopScan : handleStartScan}
              disabled={!!bleError || !isInitialized}
            >
              {isScanning ? (
                <>
                  <ActivityIndicator
                    size="small"
                    color="#FFFFFF"
                    style={styles.scanIcon}
                  />
                  <Text style={styles.scanButtonText}>Scanning...</Text>
                </>
              ) : (
                <Text style={styles.scanButtonText}>
                  {discoveredDevices.length > 0
                    ? "Scan Again"
                    : "Start Scanning"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.devicesSection}>
            <Text style={styles.sectionTitle}>
              Discovered Devices ({discoveredDevices.length})
            </Text>

            {discoveredDevices.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {isScanning
                    ? "🔍 Searching for Ring devices..."
                    : '📱 No Ring devices found. Make sure your Ring is nearby and tap "Start Scanning".'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={discoveredDevices}
                keyExtractor={(item) => item.id}
                renderItem={renderRingDevice}
                style={styles.deviceList}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Make sure your Ring is charged and within range
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  header: {
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: "#FFE5E5",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FF6B6B",
  },
  errorText: {
    color: "#D63031",
    fontSize: 14,
    textAlign: "center",
  },
  errorSubText: {
    color: "#666",
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  errorActionButton: {
    marginTop: 12,
    backgroundColor: "#007AFF",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: "center",
  },
  errorActionText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  connectedCard: {
    margin: 16,
    padding: 20,
    backgroundColor: "#E8F5E8",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  connectedTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2E7D32",
    marginBottom: 12,
    textAlign: "center",
  },
  scanSection: {
    padding: 16,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#007AFF",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  scanningButton: {
    backgroundColor: "#FF9500",
  },
  disabledButton: {
    backgroundColor: "#999",
    opacity: 0.6,
  },
  scanIcon: {
    marginRight: 8,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  devicesSection: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
  },
  deviceList: {
    flex: 1,
  },
  deviceCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  deviceDetails: {
    fontSize: 14,
    color: "#666",
    marginBottom: 2,
  },
  deviceId: {
    fontSize: 12,
    color: "#999",
    marginBottom: 2,
  },
  deviceRssi: {
    fontSize: 12,
    color: "#999",
  },
  connectButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  availableButton: {
    backgroundColor: "#007AFF",
  },
  connectingButton: {
    backgroundColor: "#FF9500",
  },
  connectButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  connectingContainer: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 10,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500",
  },
  disconnectButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    padding: 16,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});
