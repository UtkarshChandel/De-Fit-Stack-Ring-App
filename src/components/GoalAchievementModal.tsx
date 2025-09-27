/**
 * Goal Achievement Modal Component
 * Shows congratulations message when user achieves their daily heart rate goal
 */

import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";

interface GoalAchievementModalProps {
  visible: boolean;
  onClose: () => void;
  highestHeartRate: number;
  onRewardClaimed: () => void;
}

export const GoalAchievementModal: React.FC<GoalAchievementModalProps> = ({
  visible,
  onClose,
  highestHeartRate,
  onRewardClaimed,
}) => {
  const [isClaiming, setIsClaiming] = useState(false);

  const handleClaimReward = async () => {
    setIsClaiming(true);

    try {
      const response = await fetch("https://de-ring.onrender.com/mark-goal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user: "0x8c2A675014d944caF750096F601F8A103744bA5C",
          goalIndex: 0,
          steps: highestHeartRate,
          stepTarget: 90,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to claim reward: ${response.statusText}`);
      }

      const data = await response.json();
      console.log("Reward claimed successfully:", data);

      Alert.alert(
        "Success!",
        "Your reward has been claimed successfully!",
        [{ text: "OK", onPress: () => {
          onRewardClaimed();
          onClose();
        }}]
      );
    } catch (error) {
      console.error("Error claiming reward:", error);
      Alert.alert(
        "Error",
        "Failed to claim reward. Please try again later.",
        [{ text: "OK" }]
      );
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.celebrationContainer}>
            <Text style={styles.celebrationEmoji}>🎉</Text>
            <Text style={styles.congratsTitle}>Congratulations!</Text>
          </View>

          <View style={styles.messageContainer}>
            <Text style={styles.achievementText}>
              Your daily goal is achieved!
            </Text>
            <Text style={styles.subText}>
              You reached a heart rate of{" "}
              <Text style={styles.highlightText}>{highestHeartRate} bpm</Text>
            </Text>
            <Text style={styles.goalText}>
              Goal: Heart rate above 90 bpm ✓
            </Text>
          </View>

          <View style={styles.trophyContainer}>
            <Text style={styles.trophyEmoji}>🏆</Text>
          </View>

          <TouchableOpacity
            style={[styles.claimButton, isClaiming && styles.claimingButton]}
            onPress={handleClaimReward}
            disabled={isClaiming}
          >
            {isClaiming ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={styles.claimButtonText}>Claim Reward</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            disabled={isClaiming}
          >
            <Text style={styles.closeButtonText}>Maybe Later</Text>
          </TouchableOpacity>
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
  celebrationContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  celebrationEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  congratsTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
  },
  messageContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  achievementText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 12,
  },
  subText: {
    fontSize: 14,
    color: "#888",
    textAlign: "center",
    marginBottom: 8,
  },
  highlightText: {
    color: "#F44336",
    fontWeight: "600",
  },
  goalText: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "600",
    marginTop: 8,
  },
  trophyContainer: {
    marginBottom: 24,
  },
  trophyEmoji: {
    fontSize: 64,
  },
  claimButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginBottom: 12,
    minWidth: 200,
    alignItems: "center",
  },
  claimingButton: {
    opacity: 0.7,
  },
  claimButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  closeButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeButtonText: {
    color: "#999",
    fontSize: 14,
  },
});