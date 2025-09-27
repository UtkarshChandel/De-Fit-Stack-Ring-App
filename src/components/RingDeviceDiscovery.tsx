/**
 * Ring Device Discovery Component
 * Shows discovered devices with their specs and connect button
 * Following the official guide sequence
 */

import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { cleanRingConnection } from "../ring/connection/CleanRingConnection";
import { devicePersistence } from "../ring/persistence/EnhancedDevicePersistence";
import { useRingStore } from "../ring/state/ringStore";
import { SmartRingX1 } from "../types/ring";

interface DeviceCardProps {
  device: SmartRingX1;
  onConnect: (deviceId: string) => void;
  isConnecting: boolean;
}

const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  onConnect,
  isConnecting,
}) => {
  const [showSpecs, setShowSpecs] = useState(false);
  const deviceInfo1 = useRingStore((state) => state.deviceInfo1);
  const batteryData = useRingStore((state) => state.batteryData);

  return (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => setShowSpecs(!showSpecs)}
      activeOpacity={0.8}
    >
      <View style={styles.deviceHeader}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{device.name}</Text>
          <Text style={styles.deviceId}>ID: {device.id.slice(-8)}</Text>
        </View>
        <View style={styles.deviceStatus}>
          <View
            style={[
              styles.signalDot,
              { backgroundColor: getSignalColor(device.rssi) },
            ]}
          />
          <Text style={styles.rssiText}>{device.rssi} dBm</Text>
        </View>
      </View>

      {showSpecs && (
        <View style={styles.specsContainer}>
          <Text style={styles.specsTitle}>Device Specifications:</Text>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Version:</Text>
            <Text style={styles.specValue}>
              v{deviceInfo1?.deviceVer ?? "Unknown"}
            </Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Color:</Text>
            <Text style={styles.specValue}>{device.color}</Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Size:</Text>
            <Text style={styles.specValue}>{device.size}</Text>
          </View>
          <View style={styles.specRow}>
            <Text style={styles.specLabel}>Battery:</Text>
            <Text style={styles.specValue}>
              {batteryData?.batteryPer != null
                ? `${batteryData.batteryPer}%`
                : "N/A"}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.connectButton,
              isConnecting && styles.connectButtonDisabled,
            ]}
            onPress={() => !isConnecting && onConnect(device.id)}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.connectButtonText}>Connect</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
};

// Connection status messages for different phases
const CONNECTION_MESSAGES = {
  checkingStorage: "Checking for previously paired devices...",
  startingScan: "Initializing Bluetooth scanner...",
  scanning: "Scanning for Ring devices nearby...",
  deviceFound: "Ring device found!",
  connecting: "Connecting to Ring...",
  retrievingServices: "Retrieving device services...",
  verifyingDevice: "Verifying Ring device...",
  settingUpNotifications: "Setting up notifications...",
  fetchingDeviceInfo: "Fetching device information...",
  performingOEM: "Performing OEM verification...",
  syncingData: "Syncing device data...",
  connected: "Successfully connected!",
  error: "Connection failed",
};

export const RingDeviceDiscovery: React.FC = () => {
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<SmartRingX1[]>([]);
  const [autoConnecting, setAutoConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("");
  const [progressAnimation] = useState(new Animated.Value(0));
  const hasAutoConnected = useRef(false);
  const autoConnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasCheckedForPairedDevice = useRef(false);
  const isInitializing = useRef(false);

  const discoveredDevices = useRingStore((state) => state.discoveredDevices);

  useEffect(() => {
    // Only check for paired device once on mount
    if (!hasCheckedForPairedDevice.current && !isInitializing.current) {
      hasCheckedForPairedDevice.current = true;
      isInitializing.current = true;
      checkPairedDevice();
    }
  }, []); // Empty dependency array - only run once on mount

  useEffect(() => {
    // Update devices when store changes
    setDevices(discoveredDevices);

    // Auto-connect to first Ring device found if not already connected
    if (
      discoveredDevices.length > 0 &&
      !isConnecting &&
      !hasAutoConnected.current &&
      !autoConnecting // Don't auto-connect if we're already trying to connect to a paired device
    ) {
      // Clear any existing timeout
      if (autoConnectTimeout.current) {
        clearTimeout(autoConnectTimeout.current);
      }

      // Wait a bit to ensure device is stable, then auto-connect
      autoConnectTimeout.current = setTimeout(() => {
        const firstDevice = discoveredDevices[0];
        if (firstDevice && !hasAutoConnected.current && !isConnecting && !autoConnecting) {
          console.log(
            "🎯 Auto-connecting to discovered Ring device:",
            firstDevice.name
          );
          hasAutoConnected.current = true;
          handleConnect(firstDevice.id);
        }
      }, 2000); // Wait 2 seconds after discovery before auto-connecting
    }
  }, [discoveredDevices, isConnecting, autoConnecting]); // Add dependencies

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (autoConnectTimeout.current) {
        clearTimeout(autoConnectTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    // Start progress animation when auto-connecting or scanning
    if (autoConnecting || isScanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(progressAnimation, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(progressAnimation, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      progressAnimation.setValue(0);
    }
  }, [autoConnecting, isScanning]);

  const checkPairedDevice = async () => {
    try {
      // Check if we have a stored device
      const storedDevice = await devicePersistence.getPairedDevice();

      if (storedDevice) {
        hasAutoConnected.current = true; // Prevent auto-connect if we're already trying paired device
        setAutoConnecting(true);
        setConnectionStatus(CONNECTION_MESSAGES.checkingStorage);

        // Small delay for UI to update
        await new Promise((resolve) => setTimeout(resolve, 500));

        setConnectionStatus(CONNECTION_MESSAGES.connecting);
        const hasPaired = await cleanRingConnection.autoConnect();

        if (hasPaired) {
          setConnectionStatus(CONNECTION_MESSAGES.connected);
          isInitializing.current = false;
          setTimeout(() => {
            setAutoConnecting(false);
            Alert.alert(
              "Connected",
              "Successfully reconnected to your paired Ring device",
              [{ text: "OK" }]
            );
          }, 1000);
        } else {
          // Reset flag if paired device connection failed, so we can try new devices
          hasAutoConnected.current = false;
          setAutoConnecting(false);
          setConnectionStatus("");
          isInitializing.current = false;

          // Start scanning for new devices only once
          if (!isScanning) {
            console.log(
              "📱 Paired device not found, starting scan for new devices..."
            );
            setTimeout(() => handleStartScan(), 1000);
          }
        }
      } else {
        // No paired device, start scanning immediately
        isInitializing.current = false;
        if (!isScanning) {
          console.log("🔍 No paired device found, starting scan...");
          setTimeout(() => handleStartScan(), 500);
        }
      }
    } catch (error) {
      console.error("Failed to check paired device:", error);
      hasAutoConnected.current = false;
      setAutoConnecting(false);
      setConnectionStatus("");
      isInitializing.current = false;
      // Start scanning on error only if not already scanning
      if (!isScanning) {
        setTimeout(() => handleStartScan(), 1000);
      }
    }
  };

  const handleStartScan = async () => {
    // Prevent multiple scans
    if (isScanning) {
      console.log("⚠️ Scan already in progress, skipping...");
      return;
    }

    try {
      setIsScanning(true);
      setConnectionStatus(CONNECTION_MESSAGES.startingScan);

      // Small delay for UI feedback
      await new Promise((resolve) => setTimeout(resolve, 500));

      setConnectionStatus(CONNECTION_MESSAGES.scanning);
      await cleanRingConnection.startScan();

      // Monitor for devices being found
      const checkInterval = setInterval(() => {
        const currentDevices = useRingStore.getState().discoveredDevices;
        if (currentDevices.length > 0) {
          setConnectionStatus(`Found ${currentDevices.length} Ring device(s)`);
        }
      }, 1000);

      // Auto-stop after scan duration
      setTimeout(() => {
        clearInterval(checkInterval);
        setIsScanning(false);
        setConnectionStatus("");
      }, 10000);
    } catch (error) {
      setIsScanning(false);
      setConnectionStatus("");
      Alert.alert(
        "Scan Error",
        "Failed to start scanning. Please ensure Bluetooth is enabled."
      );
    }
  };

  const handleStopScan = async () => {
    setIsScanning(false);
    await cleanRingConnection.stopScan();
  };

  const handleConnect = async (deviceId: string) => {
    try {
      setIsConnecting(true);
      hasAutoConnected.current = true; // Mark that we've attempted connection
      setConnectionStatus(CONNECTION_MESSAGES.connecting);

      // Monitor connection progress through store updates
      const updateInterval = setInterval(() => {
        const info1 = useRingStore.getState().deviceInfo1;
        const battery = useRingStore.getState().batteryData;

        if (info1 && !battery) {
          setConnectionStatus(CONNECTION_MESSAGES.fetchingDeviceInfo);
        } else if (battery) {
          setConnectionStatus(CONNECTION_MESSAGES.syncingData);
        }
      }, 500);

      const success = await cleanRingConnection.connectAndSetup(deviceId);

      clearInterval(updateInterval);

      if (success) {
        setConnectionStatus(CONNECTION_MESSAGES.connected);
        setTimeout(() => {
          Alert.alert(
            "Connected",
            "Successfully connected and configured your Ring device",
            [{ text: "OK" }]
          );
        }, 1000);
      } else {
        hasAutoConnected.current = false; // Reset flag on failure so user can retry
        setConnectionStatus(CONNECTION_MESSAGES.error);
        Alert.alert(
          "Connection Failed",
          "Failed to connect to the Ring device. Please try again.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      setConnectionStatus(CONNECTION_MESSAGES.error);
      Alert.alert("Error", "An error occurred while connecting");
    } finally {
      setTimeout(() => {
        setIsConnecting(false);
        setConnectionStatus("");
      }, 2000);
    }
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No Ring devices found</Text>
      <Text style={styles.emptyStateSubtext}>
        Make sure your Ring is powered on and nearby
      </Text>
    </View>
  );

  // Show loading screen during auto-connection or initial scanning
  if (autoConnecting || (isScanning && devices.length === 0)) {
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingContent}>
          <Animated.View
            style={[
              styles.loadingRing,
              {
                transform: [
                  {
                    rotate: progressAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                  {
                    scale: progressAnimation.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [1, 1.2, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.ringOuter}>
              <View style={styles.ringInner} />
            </View>
          </Animated.View>

          <Text style={styles.loadingTitle}>De-Ring ⌬</Text>
          <Text style={styles.loadingStatus}>{connectionStatus}</Text>

          <View style={styles.loadingDotsContainer}>
            <ActivityIndicator size="small" color="#2196F3" />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ring Device Discovery</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? connectionStatus || "Scanning for devices..."
            : "Tap scan to find your Ring"}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.scanButton, isScanning && styles.scanButtonActive]}
        onPress={isScanning ? handleStopScan : handleStartScan}
        disabled={isConnecting}
      >
        {isScanning ? (
          <>
            <ActivityIndicator
              color="#FFF"
              size="small"
              style={styles.scanIcon}
            />
            <Text style={styles.scanButtonText}>Stop Scanning</Text>
          </>
        ) : (
          <Text style={styles.scanButtonText}>Start Scan</Text>
        )}
      </TouchableOpacity>

      {isConnecting && connectionStatus && (
        <View style={styles.connectionStatusBar}>
          <ActivityIndicator
            size="small"
            color="#2196F3"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.connectionStatusText}>{connectionStatus}</Text>
        </View>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DeviceCard
            device={item}
            onConnect={handleConnect}
            isConnecting={isConnecting}
          />
        )}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
};

function getSignalColor(rssi: number): string {
  if (rssi > -60) return "#4CAF50"; // Excellent
  if (rssi > -70) return "#8BC34A"; // Good
  if (rssi > -80) return "#FFC107"; // Fair
  return "#F44336"; // Poor
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingContent: {
    alignItems: "center",
    padding: 32,
  },
  loadingRing: {
    width: 120,
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 32,
  },
  ringOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 12,
    borderColor: "#2196F3",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#2196F3",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  ringInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E3F2FD",
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  loadingStatus: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 24,
    minHeight: 20,
  },
  loadingDotsContainer: {
    height: 20,
  },
  connectionStatusBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#E3F2FD",
    marginHorizontal: 16,
    marginTop: -8,
    borderRadius: 8,
  },
  connectionStatusText: {
    fontSize: 14,
    color: "#2196F3",
    fontWeight: "500",
  },
  header: {
    padding: 20,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E0E0E0",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  scanButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#2196F3",
    paddingVertical: 12,
    paddingHorizontal: 24,
    margin: 16,
    borderRadius: 8,
  },
  scanButtonActive: {
    backgroundColor: "#F44336",
  },
  scanButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  scanIcon: {
    marginRight: 8,
  },
  listContent: {
    padding: 16,
  },
  deviceCard: {
    backgroundColor: "#FFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
  },
  deviceId: {
    fontSize: 12,
    color: "#999",
    marginTop: 2,
  },
  deviceStatus: {
    flexDirection: "row",
    alignItems: "center",
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  rssiText: {
    fontSize: 12,
    color: "#666",
  },
  specsContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  specsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  specRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  specLabel: {
    fontSize: 14,
    color: "#666",
  },
  specValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
  },
  connectButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  connectButtonDisabled: {
    backgroundColor: "#CCC",
  },
  connectButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: "#999",
  },
});
