/**
 * Clear Data Confirmation Modal Component
 * Shows confirmation dialog before clearing all historical data
 */

import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

interface ClearDataConfirmationModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isClearing: boolean;
}

export const ClearDataConfirmationModal: React.FC<ClearDataConfirmationModalProps> = ({
  visible,
  onClose,
  onConfirm,
  isClearing,
}) => {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.iconContainer}>
            <Text style={styles.warningIcon}>⚠️</Text>
          </View>

          <Text style={styles.title}>Clear All Data?</Text>

          <Text style={styles.message}>
            This will permanently delete all historical health data from your Ring device and this app.
          </Text>

          <Text style={styles.warningText}>
            This action cannot be undone.
          </Text>

          <View style={styles.dataTypesContainer}>
            <Text style={styles.dataTypesTitle}>Data to be cleared:</Text>
            <Text style={styles.dataTypeItem}>• Heart rate history</Text>
            <Text style={styles.dataTypeItem}>• Blood oxygen readings</Text>
            <Text style={styles.dataTypeItem}>• Temperature records</Text>
            <Text style={styles.dataTypeItem}>• Step count history</Text>
            <Text style={styles.dataTypeItem}>• Sleep data</Text>
            <Text style={styles.dataTypeItem}>• Activity records</Text>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isClearing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.clearButton, isClearing && styles.clearingButton]}
              onPress={onConfirm}
              disabled={isClearing}
            >
              {isClearing ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Text style={styles.clearButtonIcon}>🗑️</Text>
                  <Text style={styles.clearButtonText}>Clear All Data</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    width: "100%",
    maxWidth: 340,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  iconContainer: {
    marginBottom: 16,
  },
  warningIcon: {
    fontSize: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 20,
  },
  warningText: {
    fontSize: 14,
    color: "#F44336",
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 20,
  },
  dataTypesContainer: {
    width: "100%",
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  dataTypesTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  dataTypeItem: {
    fontSize: 13,
    color: "#666",
    marginBottom: 4,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#E0E0E0",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  clearButton: {
    flex: 1,
    flexDirection: "row",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: "#F44336",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  clearingButton: {
    opacity: 0.7,
  },
  clearButtonIcon: {
    fontSize: 16,
  },
  clearButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
});