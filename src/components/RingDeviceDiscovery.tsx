/**
 * Ring Device Discovery Component
 * Shows discovered devices with their specs and connect button
 * Following the official guide sequence
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
import {
  ConnectionState,
  cleanRingConnection,
} from "../ring/connection/CleanRingConnection";
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

export const RingDeviceDiscovery: React.FC = () => {
  const [phase, setPhase] = useState<ConnectionState>(ConnectionState.IDLE);
  const [isScanning, setIsScanning] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [devices, setDevices] = useState<SmartRingX1[]>([]);

  const discoveredDevices = useRingStore((state) => state.discoveredDevices);
  const connectionStatus = useRingStore((state) => state.connectionStatus);

  useEffect(() => {
    // Check for paired device on mount
    checkPairedDevice();

    // Update devices when store changes
    setDevices(Array.from(discoveredDevices.values()));
  }, [discoveredDevices]);

  const checkPairedDevice = async () => {
    const hasPaired = await cleanRingConnection.autoConnect();
    if (hasPaired) {
      Alert.alert(
        "Connected",
        "Successfully reconnected to your paired Ring device",
        [{ text: "OK" }]
      );
    }
  };

  const handleStartScan = async () => {
    try {
      setIsScanning(true);
      await cleanRingConnection.startScan();

      // Auto-stop after scan duration
      setTimeout(() => {
        setIsScanning(false);
      }, 10000);
    } catch (error) {
      setIsScanning(false);
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
      const success = await cleanRingConnection.connectAndSetup(deviceId);

      if (success) {
        Alert.alert(
          "Connected",
          "Successfully connected and configured your Ring device",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Connection Failed",
          "Failed to connect to the Ring device. Please try again.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      Alert.alert("Error", "An error occurred while connecting");
    } finally {
      setIsConnecting(false);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ring Device Discovery</Text>
        <Text style={styles.subtitle}>
          {isScanning
            ? "Scanning for devices..."
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
