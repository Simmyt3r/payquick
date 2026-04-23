// screens/CableTVScreen.js
import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, ActivityIndicator,
} from "react-native";
import axios from "axios";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useUser } from "../hooks/useUser";
import { ScreenHeader, Button, Card } from "../components/UI";
import { COLORS, FONTS, RADIUS } from "../utils/theme";

const PROVIDERS = [
  { id: "dstv",       label: "DSTV",       color: "#003087", text: "#fff", inputLabel: "Smartcard Number" },
  { id: "gotv",       label: "GOtv",       color: "#F7901E", text: "#fff", inputLabel: "IUC Number"       },
  { id: "startimes",  label: "Startimes",  color: "#E30613", text: "#fff", inputLabel: "Smartcard Number" },
];

const VTPASS_BASE = "https://sandbox.vtpass.com/api";
const VTPASS_USER = "PASTE_VTPASS_USERNAME";
const VTPASS_PASS = "PASTE_VTPASS_PASSWORD";

export default function CableTVScreen({ navigation }) {
  const { userData } = useUser();
  const [provider,     setProvider]     = useState(null);
  const [smartcard,    setSmartcard]    = useState("");
  const [plans,        setPlans]        = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loading,      setLoading]      = useState(false);

  const balance = userData?.walletBalance ?? 0;

  useEffect(() => {
    if (!provider) return;
    fetchPlans(provider.id);
  }, [provider]);

  const fetchPlans = async (serviceID) => {
    setLoadingPlans(true);
    setPlans([]);
    setSelectedPlan(null);
    try {
      const tokenRes = await axios.post(`${VTPASS_BASE}/token`, { username: VTPASS_USER, password: VTPASS_PASS });
      const token = tokenRes.data.token;
      const res = await axios.get(`${VTPASS_BASE}/service-variations?serviceID=${serviceID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlans(res.data?.content?.varations || []);
    } catch {
      // Fallback DSTV plans for sandbox testing
      if (serviceID === "dstv") {
        setPlans([
          { variation_code: "dstv-padi",     name: "DStv Padi",     variation_amount: "2150"  },
          { variation_code: "dstv-yanga",    name: "DStv Yanga",    variation_amount: "3000"  },
          { variation_code: "dstv-confam",   name: "DStv Confam",   variation_amount: "4615"  },
          { variation_code: "dstv-compact",  name: "DStv Compact",  variation_amount: "9000"  },
          { variation_code: "dstv-compactplus", name: "DStv Compact+", variation_amount: "14250" },
          { variation_code: "dstv-premium",  name: "DStv Premium",  variation_amount: "24500" },
        ]);
      } else if (serviceID === "gotv") {
        setPlans([
          { variation_code: "gotv-smallie",  name: "GOtv Smallie",  variation_amount: "1575" },
          { variation_code: "gotv-jinja",    name: "GOtv Jinja",    variation_amount: "2715" },
          { variation_code: "gotv-jolli",    name: "GOtv Jolli",    variation_amount: "3960" },
          { variation_code: "gotv-max",      name: "GOtv Max",      variation_amount: "5200" },
          { variation_code: "gotv-supa",     name: "GOtv Supa",     variation_amount: "6400" },
        ]);
      }
    } finally {
      setLoadingPlans(false);
    }
  };

  const handlePay = () => {
    if (!provider)     { Alert.alert("Select Provider", "Choose DSTV, GOtv or Startimes."); return; }
    if (!selectedPlan) { Alert.alert("Select Plan",     "Choose a subscription plan."); return; }
    if (!smartcard.trim()) { Alert.alert("Enter Number", `Please enter your ${provider.inputLabel}.`); return; }
    const planAmount = parseFloat(selectedPlan.variation_amount);
    if (planAmount > balance) {
      Alert.alert("Insufficient Balance", `Your wallet has ₦${balance.toLocaleString()}. Please fund first.`); return;
    }
    Alert.alert(
      "Confirm Subscription",
      `Subscribe to ${selectedPlan.name} on ${provider.label}?\nSmartcard: ${smartcard}\nCost: ₦${planAmount.toLocaleString()}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: processPay },
      ]
    );
  };

  const processPay = async () => {
    setLoading(true);
    try {
      const fn  = httpsCallable(functions, "payCableTV");
      const res = await fn({
        smartcardNumber: smartcard.trim(),
        variation_code:  selectedPlan.variation_code,
        amount:          parseFloat(selectedPlan.variation_amount),
        provider:        provider.id,
      });
      Alert.alert("Subscription Active! 📺", res.data.message, [
        { text: "Done", onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert("Subscription Failed", err.message || "Something went wrong. Your wallet was not debited.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title="Cable TV Subscription" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Balance */}
        <View style={styles.balanceBanner}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceValue}>₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</Text>
        </View>

        {/* Provider selector */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Select Provider</Text>
          <View style={styles.providerRow}>
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.providerBtn, { borderColor: p.color }, provider?.id === p.id && { backgroundColor: p.color }]}
                onPress={() => setProvider(p)}
                activeOpacity={0.8}
              >
                <Text style={[styles.providerLabel, provider?.id === p.id && { color: p.text }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Smartcard number */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>{provider?.inputLabel ?? "Smartcard / IUC Number"}</Text>
          <TextInput
            style={styles.input}
            value={smartcard}
            onChangeText={setSmartcard}
            placeholder={`Enter your ${provider?.inputLabel?.toLowerCase() ?? "smartcard number"}`}
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </Card>

        {/* Plans */}
        {provider && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Select Plan</Text>
            {loadingPlans ? (
              <ActivityIndicator color={COLORS.purple} style={{ marginVertical: 20 }} />
            ) : plans.length === 0 ? (
              <Text style={styles.noPlans}>No plans available.</Text>
            ) : (
              plans.map((p) => (
                <TouchableOpacity
                  key={p.variation_code}
                  style={[styles.planRow, selectedPlan?.variation_code === p.variation_code && styles.planRowActive]}
                  onPress={() => setSelectedPlan(p)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.planName}>{p.name}</Text>
                  <Text style={styles.planPrice}>₦{parseFloat(p.variation_amount).toLocaleString()}/month</Text>
                </TouchableOpacity>
              ))
            )}
          </Card>
        )}

        <Button
          label={selectedPlan
            ? `Subscribe — ₦${parseFloat(selectedPlan.variation_amount).toLocaleString()}`
            : "Select a plan to continue"
          }
          onPress={handlePay}
          loading={loading}
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },
  balanceBanner: { backgroundColor: "#880E4F", borderRadius: RADIUS.lg, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  balanceLabel:  { fontSize: FONTS.sm, color: "rgba(255,255,255,0.85)" },
  balanceValue:  { fontSize: FONTS.xl, fontWeight: "800", color: COLORS.white },
  card:          { marginBottom: 14 },
  sectionLabel:  { fontSize: FONTS.sm, fontWeight: "700", color: COLORS.textLight, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },
  providerRow:   { flexDirection: "row", gap: 12 },
  providerBtn:   { flex: 1, borderWidth: 2, borderRadius: RADIUS.md, paddingVertical: 14, alignItems: "center" },
  providerLabel: { fontWeight: "800", fontSize: FONTS.md, color: COLORS.text },
  input:         { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: FONTS.md, color: COLORS.text, backgroundColor: COLORS.bg },
  planRow:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 14, paddingHorizontal: 12, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 8, backgroundColor: COLORS.white },
  planRowActive: { borderColor: "#880E4F", backgroundColor: "#fce4ec" },
  planName:      { fontSize: FONTS.md, fontWeight: "600", color: COLORS.text },
  planPrice:     { fontSize: FONTS.md, fontWeight: "800", color: "#880E4F" },
  noPlans:       { textAlign: "center", color: COLORS.textMuted, paddingVertical: 16 },
});
