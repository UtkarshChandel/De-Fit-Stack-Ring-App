/**
 * Ring Connection Screen (Refactored)
 * Clean UI component that uses the refactored connection architecture
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
import { useRingSetup } from "../../src/ring/device/ringSetupRefactored";
import { SmartRingX1 } from "../../src/types/ring";

interface RingConnectionScreenProps {
  onConnectionSuccess: (ring: SmartRingX1) => void;
}

export default function RingConnectionScreen({
  onConnectionSuccess,
}: RingConnectionScreenProps) {
  const {
    isScanning,
    isConnecting,
    isConnected,
    discoveredDevices,
    connectedRing,
    connectionError,
    connectionStatus,
    startScan,
    stopScan,
    connectToRing,
    disconnectFromRing,
  } = useRingSetup();

  // Handle successful connection
  useEffect(() => {
    if (isConnected && connectedRing) {
      onConnectionSuccess(connectedRing);
    }
  }, [isConnected, connectedRing, onConnectionSuccess]);

  const handleStartScan = async () => {
    try {
      await startScan();
    } catch (error) {
      // Error already handled by hook with Alert
    }
  };

  const handleConnectToRing = async (deviceId: string) => {
    try {
      await connectToRing(deviceId);
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        "Unable to connect to the Ring device. Please ensure the device is nearby and try again.",
        [{ text: "OK", style: "default" }]
      );
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectFromRing();
    } catch (error) {
      Alert.alert("Disconnect Error", "Failed to disconnect from Ring device");
    }
  };

  const renderRingDevice = ({ item }: { item: SmartRingX1 }) => {
    const isCurrentlyConnecting = 
      connectionStatus.isConnecting && connectionStatus.deviceId === item.id;

    return (
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
            isCurrentlyConnecting
              ? styles.connectingButton
              : styles.availableButton,
          ]}
          onPress={() => handleConnectToRing(item.id)}
          disabled={isConnecting}
        >
          {isCurrentlyConnecting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.connectButtonText}>Connect</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

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

      {connectionError && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>❌ {connectionError}</Text>
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
              ]}
              onPress={isScanning ? stopScan : handleStartScan}
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
  disconnectButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginTop: 12,
    alignSelf: "center",
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