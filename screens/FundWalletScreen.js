// screens/FundWalletScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Linking,
} from "react-native";
import axios from "axios";
import { auth } from "../firebase";
import { ScreenHeader, Button, Card } from "../components/UI";
import { COLORS, FONTS, RADIUS, SHADOW } from "../utils/theme";

// ⚠️ Replace with your Flutterwave PUBLIC key (not secret key)
const FLW_PUBLIC_KEY = "FLWPUBK_TEST-PASTE_YOUR_PUBLIC_KEY_HERE";

const QUICK = [500, 1000, 2000, 5000, 10000, 20000];

export default function FundWalletScreen({ navigation }) {
  const [amount,  setAmount]  = useState("");
  const [loading, setLoading] = useState(false);

  const numAmount = parseFloat(amount) || 0;

  const handleFund = async () => {
    if (numAmount < 100) {
      return Alert.alert("Invalid Amount", "Minimum funding amount is ₦100.");
    }

    setLoading(true);
    try {
      const user  = auth.currentUser;
      const txRef = `FUND_${user.uid}_${Date.now()}`;

      const res = await axios.post(
        "https://api.flutterwave.com/v3/payments",
        {
          tx_ref:       txRef,
          amount:       numAmount,
          currency:     "NGN",
          redirect_url: "https://payquick.ng/payment-complete",
          customer: {
            email:        user.email,
            phonenumber:  "",
            name:         user.displayName || "PayQuick User",
          },
          customizations: {
            title:       "Fund Your Wallet",
            description: `Add ₦${numAmount.toLocaleString()} to your PayQuick wallet`,
            logo:        "https://yourapp.com/logo.png",
          },
          payment_options: "card,banktransfer,ussd",
        },
        {
          headers: {
            Authorization: `Bearer ${FLW_PUBLIC_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const link = res.data?.data?.link;
      if (link) {
        await Linking.openURL(link);
        Alert.alert(
          "Payment Opened",
          "Complete the payment in your browser. Your wallet will be credited automatically once payment is confirmed.",
          [{ text: "Done", onPress: () => navigation.goBack() }]
        );
      } else {
        throw new Error("No payment link received");
      }
    } catch (err) {
      console.error("Fund wallet error:", err?.response?.data || err.message);
      Alert.alert("Error", "Could not initialize payment. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Fund Wallet" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Amount input */}
        <Card style={styles.inputCard}>
          <Text style={styles.inputLabel}>Enter Amount</Text>
          <View style={styles.amountRow}>
            <Text style={styles.nairaSign}>₦</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={COLORS.textMuted}
            />
          </View>
          <Text style={styles.minNote}>Minimum: ₦100</Text>
        </Card>

        {/* Quick amounts */}
        <Text style={styles.quickLabel}>Quick Select</Text>
        <View style={styles.quickGrid}>
          {QUICK.map((q) => (
            <TouchableOpacity
              key={q}
              style={[styles.quickBtn, numAmount === q && styles.quickBtnActive]}
              onPress={() => setAmount(String(q))}
              activeOpacity={0.7}
            >
              <Text style={[styles.quickText, numAmount === q && styles.quickTextActive]}>
                ₦{q.toLocaleString()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Summary */}
        {numAmount >= 100 && (
          <Card style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Amount to fund</Text>
              <Text style={styles.summaryValue}>₦{numAmount.toLocaleString()}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing fee</Text>
              <Text style={styles.summaryValue}>₦0.00</Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryTotal]}>
              <Text style={styles.summaryTotalLabel}>You will pay</Text>
              <Text style={styles.summaryTotalValue}>₦{numAmount.toLocaleString()}</Text>
            </View>
          </Card>
        )}

        {/* Pay button */}
        <Button
          label="Proceed to Payment"
          onPress={handleFund}
          loading={loading}
          style={styles.payBtn}
        />

        {/* Trust badges */}
        <View style={styles.badges}>
          {["🔒 Secured by Flutterwave", "⚡ Instant credit", "✅ No hidden fees"].map((b) => (
            <Text key={b} style={styles.badgeText}>{b}</Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  inputCard:  { marginBottom: 8 },
  inputLabel: { fontSize: FONTS.sm, color: COLORS.textLight, marginBottom: 12 },
  amountRow:  { flexDirection: "row", alignItems: "center" },
  nairaSign:  { fontSize: 32, fontWeight: "700", color: COLORS.purple, marginRight: 8 },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: "800",
    color: COLORS.navy,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.purple,
    paddingVertical: 6,
  },
  minNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 8 },

  quickLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textLight,
    marginTop: 20,
    marginBottom: 10,
  },
  quickGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  quickBtn: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.full,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: COLORS.white,
  },
  quickBtnActive: { borderColor: COLORS.purple, backgroundColor: "#eef0fb" },
  quickText:      { fontSize: FONTS.sm, color: COLORS.textLight, fontWeight: "600" },
  quickTextActive:{ color: COLORS.purple },

  summary: { marginBottom: 20 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryLabel:      { fontSize: FONTS.sm, color: COLORS.textLight },
  summaryValue:      { fontSize: FONTS.sm, color: COLORS.text, fontWeight: "600" },
  summaryTotal:      { borderBottomWidth: 0, marginTop: 4 },
  summaryTotalLabel: { fontSize: FONTS.md, fontWeight: "700", color: COLORS.navy },
  summaryTotalValue: { fontSize: FONTS.xl, fontWeight: "800", color: COLORS.purple },

  payBtn:  { marginTop: 4 },
  badges:  { marginTop: 20, gap: 8, alignItems: "center" },
  badgeText:{ fontSize: FONTS.sm, color: COLORS.textMuted },
});
