// screens/BuyDataScreen.js
import React, { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView, TextInput, ActivityIndicator,
} from "react-native";
import axios from "axios";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useUser } from "../hooks/useUser";
import { ScreenHeader, Button, Card } from "../components/UI";
import { COLORS, FONTS, RADIUS } from "../utils/theme";

const NETWORKS = [
  { id: "mtn",      serviceID: "mtn-data",      label: "MTN",     color: "#FFCC00", text: "#333" },
  { id: "airtel",   serviceID: "airtel-data",   label: "Airtel",  color: "#FF0000", text: "#fff" },
  { id: "glo",      serviceID: "glo-data",      label: "Glo",     color: "#00A550", text: "#fff" },
  { id: "etisalat", serviceID: "etisalat-data", label: "9mobile", color: "#006341", text: "#fff" },
];

// VTPass sandbox base URL — change to https://vtpass.com for production
const VTPASS_BASE = "https://sandbox.vtpass.com/api";
const VTPASS_USER = "PASTE_VTPASS_USERNAME";
const VTPASS_PASS = "PASTE_VTPASS_PASSWORD";

export default function BuyDataScreen({ navigation }) {
  const { userData }  = useUser();
  const [network,     setNetwork]    = useState(null);
  const [phone,       setPhone]      = useState("");
  const [plans,       setPlans]      = useState([]);
  const [selectedPlan,setSelectedPlan] = useState(null);
  const [loadingPlans,setLoadingPlans] = useState(false);
  const [loading,     setLoading]    = useState(false);

  const balance = userData?.walletBalance ?? 0;

  // Fetch data plans from VTPass when network changes
  useEffect(() => {
    if (!network) return;
    fetchPlans(network.serviceID);
  }, [network]);

  const fetchPlans = async (serviceID) => {
    setLoadingPlans(true);
    setPlans([]);
    setSelectedPlan(null);
    try {
      // Get VTPass token first
      const tokenRes = await axios.post(`${VTPASS_BASE}/token`, {
        username: VTPASS_USER,
        password: VTPASS_PASS,
      });
      const token = tokenRes.data.token;

      const res = await axios.get(
        `${VTPASS_BASE}/service-variations?serviceID=${serviceID}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const variations = res.data?.content?.varations || [];
      setPlans(variations);
    } catch (err) {
      // Fallback to hardcoded MTN plans if API fails (useful for testing)
      if (serviceID === "mtn-data") {
        setPlans([
          { variation_code: "mtn-10mb-100",  name: "10MB — 1 Day",    variation_amount: "100"  },
          { variation_code: "mtn-50mb-200",  name: "50MB — 1 Day",    variation_amount: "200"  },
          { variation_code: "mtn-1gb-300",   name: "1GB — 1 Day",     variation_amount: "300"  },
          { variation_code: "mtn-1gb-1000",  name: "1GB — 30 Days",   variation_amount: "1000" },
          { variation_code: "mtn-2gb-1200",  name: "2GB — 30 Days",   variation_amount: "1200" },
          { variation_code: "mtn-5gb-2500",  name: "5GB — 30 Days",   variation_amount: "2500" },
          { variation_code: "mtn-10gb-5000", name: "10GB — 30 Days",  variation_amount: "5000" },
        ]);
      }
    } finally {
      setLoadingPlans(false);
    }
  };

  const handleBuy = () => {
    if (!network)      { Alert.alert("Select Network", "Please choose a network."); return; }
    if (!selectedPlan) { Alert.alert("Select Plan",    "Please choose a data plan."); return; }
    if (!/^0[789][01]\d{8}$/.test(phone)) {
      Alert.alert("Invalid Phone", "Enter a valid 11-digit Nigerian phone number."); return;
    }
    const planAmount = parseFloat(selectedPlan.variation_amount);
    if (planAmount > balance) {
      Alert.alert("Insufficient Balance", `Your wallet has ₦${balance.toLocaleString()}. Please fund first.`); return;
    }
    Alert.alert(
      "Confirm Purchase",
      `Activate ${selectedPlan.name} for ${phone}?\nCost: ₦${parseFloat(selectedPlan.variation_amount).toLocaleString()}`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: processBuy },
      ]
    );
  };

  const processBuy = async () => {
    setLoading(true);
    try {
      const fn  = httpsCallable(functions, "buyData");
      const res = await fn({
        phone,
        variation_code: selectedPlan.variation_code,
        amount:         parseFloat(selectedPlan.variation_amount),
        network:        network.id,
      });
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
      <ScreenHeader title="Buy Data Bundle" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Balance */}
        <View style={styles.balanceBanner}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceValue}>₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</Text>
        </View>

        {/* Network */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Select Network</Text>
          <View style={styles.networkRow}>
            {NETWORKS.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[styles.networkBtn, { borderColor: n.color }, network?.id === n.id && { backgroundColor: n.color }]}
                onPress={() => setNetwork(n)}
                activeOpacity={0.8}
              >
                <Text style={[styles.networkLabel, { color: network?.id === n.id ? n.text : COLORS.text }]}>
                  {n.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Phone */}
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
        </Card>

        {/* Plans */}
        {network && (
          <Card style={styles.card}>
            <Text style={styles.sectionLabel}>Select Data Plan</Text>
            {loadingPlans ? (
              <ActivityIndicator color={COLORS.purple} style={{ marginVertical: 20 }} />
            ) : plans.length === 0 ? (
              <Text style={styles.noPlans}>No plans available for this network.</Text>
            ) : (
              plans.map((p) => (
                <TouchableOpacity
                  key={p.variation_code}
                  style={[styles.planRow, selectedPlan?.variation_code === p.variation_code && styles.planRowActive]}
                  onPress={() => setSelectedPlan(p)}
                  activeOpacity={0.8}
                >
                  <View>
                    <Text style={styles.planName}>{p.name}</Text>
                    <Text style={styles.planCode}>{p.variation_code}</Text>
                  </View>
                  <Text style={styles.planPrice}>₦{parseFloat(p.variation_amount).toLocaleString()}</Text>
                </TouchableOpacity>
              ))
            )}
          </Card>
        )}

        <Button
          label={selectedPlan
            ? `Buy ${selectedPlan.name} — ₦${parseFloat(selectedPlan.variation_amount).toLocaleString()}`
            : "Select a plan to continue"
          }
          onPress={handleBuy}
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

  balanceBanner: {
    backgroundColor: COLORS.green,
    borderRadius: RADIUS.lg,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  balanceLabel: { fontSize: FONTS.sm, color: "rgba(255,255,255,0.85)" },
  balanceValue: { fontSize: FONTS.xl, fontWeight: "800", color: COLORS.white },

  card:         { marginBottom: 14 },
  sectionLabel: { fontSize: FONTS.sm, fontWeight: "700", color: COLORS.textLight, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  networkRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  networkBtn: { flex: 1, borderWidth: 2, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: "center" },
  networkLabel:{ fontWeight: "700", fontSize: FONTS.sm },

  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: FONTS.md,
    color: COLORS.text, backgroundColor: COLORS.bg,
  },

  planRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 12, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, marginBottom: 8,
    backgroundColor: COLORS.white,
  },
  planRowActive: { borderColor: COLORS.purple, backgroundColor: "#eef0fb" },
  planName:  { fontSize: FONTS.md, fontWeight: "600", color: COLORS.text },
  planCode:  { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  planPrice: { fontSize: FONTS.md, fontWeight: "800", color: COLORS.purple },
  noPlans:   { textAlign: "center", color: COLORS.textMuted, paddingVertical: 16 },
});
