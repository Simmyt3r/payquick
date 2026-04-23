// screens/BuyAirtimeScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, TextInput,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useUser } from "../hooks/useUser";
import { ScreenHeader, Button, Card } from "../components/UI";
import { COLORS, FONTS, RADIUS, SHADOW } from "../utils/theme";

const NETWORKS = [
  { id: "mtn",      label: "MTN",    color: "#FFCC00", text: "#333" },
  { id: "airtel",   label: "Airtel", color: "#FF0000", text: "#fff" },
  { id: "glo",      label: "Glo",    color: "#00A550", text: "#fff" },
  { id: "etisalat", label: "9mobile",color: "#006341", text: "#fff" },
];

const PRESETS = [50, 100, 200, 500, 1000, 2000];

export default function BuyAirtimeScreen({ navigation }) {
  const { userData } = useUser();
  const [network,  setNetwork]  = useState(null);
  const [phone,    setPhone]    = useState("");
  const [amount,   setAmount]   = useState("");
  const [loading,  setLoading]  = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const balance   = userData?.walletBalance ?? 0;

  const validate = () => {
    if (!network)                         { Alert.alert("Select Network", "Please choose a network."); return false; }
    if (!/^0[789][01]\d{8}$/.test(phone)) { Alert.alert("Invalid Phone", "Enter a valid 11-digit Nigerian phone number."); return false; }
    if (numAmount < 50)                   { Alert.alert("Invalid Amount", "Minimum airtime amount is ₦50."); return false; }
    if (numAmount > balance)              { Alert.alert("Insufficient Balance", `Your wallet balance is ₦${balance.toLocaleString()}. Please fund your wallet first.`); return false; }
    return true;
  };

  const handleBuy = () => {
    if (!validate()) return;
    Alert.alert(
      "Confirm Purchase",
      `Buy ₦${numAmount.toLocaleString()} ${network.label} airtime for ${phone}?\n\nThis will deduct ₦${numAmount.toLocaleString()} from your wallet.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: processBuy },
      ]
    );
  };

  const processBuy = async () => {
    setLoading(true);
    try {
      const fn  = httpsCallable(functions, "buyAirtime");
      const res = await fn({ phone, amount: numAmount, network: network.id });
      Alert.alert("Success! 🎉", res.data.message, [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Purchase Failed", err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Buy Airtime" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Balance banner */}
        <View style={styles.balanceBanner}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceValue}>₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</Text>
        </View>

        {/* Network selector */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Select Network</Text>
          <View style={styles.networkRow}>
            {NETWORKS.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[
                  styles.networkBtn,
                  { borderColor: n.color },
                  network?.id === n.id && { backgroundColor: n.color },
                ]}
                onPress={() => setNetwork(n)}
                activeOpacity={0.8}
              >
                <Text style={[
                  styles.networkLabel,
                  { color: network?.id === n.id ? n.text : COLORS.text },
                ]}>
                  {n.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Phone number */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Phone Number</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="08012345678"
            keyboardType="phone-pad"
            maxLength={11}
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={styles.hint}>Enter the number that will receive the airtime</Text>
        </Card>

        {/* Amount */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Amount (₦)</Text>
          <View style={styles.presets}>
            {PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.preset, numAmount === p && styles.presetActive]}
                onPress={() => setAmount(String(p))}
              >
                <Text style={[styles.presetText, numAmount === p && styles.presetTextActive]}>
                  ₦{p.toLocaleString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={[styles.input, { marginTop: 12 }]}
            value={amount}
            onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ""))}
            placeholder="Or enter custom amount"
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textMuted}
          />
          <Text style={styles.hint}>Min: ₦50 · Max: ₦50,000</Text>
        </Card>

        <Button
          label={`Buy Airtime${numAmount > 0 ? ` — ₦${numAmount.toLocaleString()}` : ""}`}
          onPress={handleBuy}
          loading={loading}
          style={styles.buyBtn}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  balanceBanner: {
    backgroundColor: COLORS.purple,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: { fontSize: FONTS.sm, color: "rgba(255,255,255,0.8)" },
  balanceValue: { fontSize: FONTS.xl, fontWeight: "800", color: COLORS.white },

  card:         { marginBottom: 14 },
  sectionLabel: { fontSize: FONTS.sm, fontWeight: "700", color: COLORS.textLight, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  networkRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  networkBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: RADIUS.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  networkLabel: { fontWeight: "700", fontSize: FONTS.sm },

  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FONTS.md,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  hint: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },

  presets:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset:         { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: COLORS.white },
  presetActive:   { borderColor: COLORS.purple, backgroundColor: "#eef0fb" },
  presetText:     { fontSize: FONTS.sm, color: COLORS.textLight, fontWeight: "600" },
  presetTextActive:{ color: COLORS.purple },

  buyBtn: { marginTop: 8 },
});
