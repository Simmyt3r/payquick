// screens/ElectricityScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView, TextInput, Modal, Pressable,
} from "react-native";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useUser } from "../hooks/useUser";
import { ScreenHeader, Button, Card } from "../components/UI";
import { COLORS, FONTS, RADIUS } from "../utils/theme";

const DISCOS = [
  { id: "ikeja-electric",  label: "Ikeja Electric (IKEDC)",   state: "Lagos" },
  { id: "eko-electric",    label: "Eko Electric (EKEDC)",     state: "Lagos/Ogun" },
  { id: "abuja-electric",  label: "Abuja Electric (AEDC)",    state: "Abuja/FCT" },
  { id: "kano-electric",   label: "Kano Electric (KEDCO)",    state: "Kano" },
  { id: "portharcourt-electric", label: "PH Electric (PHED)", state: "Rivers/Bayelsa" },
  { id: "jos-electric",    label: "Jos Electric (JED)",       state: "Plateau" },
  { id: "ibadan-electric", label: "Ibadan Electric (IBEDC)",  state: "Oyo/Osun" },
  { id: "kaduna-electric", label: "Kaduna Electric (KAEDC)",  state: "Kaduna" },
  { id: "enugu-electric",  label: "Enugu Electric (EEDC)",    state: "Enugu/Anambra" },
  { id: "benin-electric",  label: "Benin Electric (BEDC)",    state: "Edo/Delta" },
];

const AMOUNT_PRESETS = [1000, 2000, 3000, 5000, 10000, 20000];

export default function ElectricityScreen({ navigation }) {
  const { userData } = useUser();
  const [disco,     setDisco]     = useState(null);
  const [meterType, setMeterType] = useState("prepaid");
  const [meter,     setMeter]     = useState("");
  const [amount,    setAmount]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [token,     setToken]     = useState(null);       // electricity token after success
  const [showPicker, setShowPicker] = useState(false);

  const balance   = userData?.walletBalance ?? 0;
  const numAmount = parseFloat(amount) || 0;

  const validate = () => {
    if (!disco)                        { Alert.alert("Select DISCO", "Choose your electricity distribution company."); return false; }
    if (!meter.trim())                 { Alert.alert("Enter Meter", "Please enter your meter number."); return false; }
    if (numAmount < 500)               { Alert.alert("Minimum Amount", "Minimum electricity payment is ₦500."); return false; }
    if (numAmount > balance)           { Alert.alert("Insufficient Balance", `Your wallet has ₦${balance.toLocaleString()}.`); return false; }
    return true;
  };

  const handlePay = () => {
    if (!validate()) return;
    Alert.alert(
      "Confirm Payment",
      `Pay ₦${numAmount.toLocaleString()} for ${meterType} meter ${meter}\n(${disco.label})`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: processPay },
      ]
    );
  };

  const processPay = async () => {
    setLoading(true);
    try {
      const fn  = httpsCallable(functions, "payElectricity");
      const res = await fn({
        meterNumber: meter.trim(),
        amount:      numAmount,
        disco:       disco.id,
        meterType,
      });
      if (res.data.token) {
        setToken(res.data.token);
      } else {
        Alert.alert("Payment Successful! ⚡", res.data.message, [
          { text: "Done", onPress: () => navigation.goBack() },
        ]);
      }
    } catch (err) {
      Alert.alert("Payment Failed", err.message || "Something went wrong. Your wallet has not been debited.");
    } finally {
      setLoading(false);
    }
  };

  // ── Token success modal ──────────────────────────────────
  if (token) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="Payment Complete" onBack={() => navigation.goBack()} />
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>⚡</Text>
          <Text style={styles.successTitle}>Payment Successful!</Text>
          <Text style={styles.successSub}>Your electricity token is ready</Text>
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>TOKEN NUMBER</Text>
            <Text style={styles.tokenValue}>{token}</Text>
          </View>
          <Text style={styles.tokenHint}>Enter this token on your meter to credit electricity units.</Text>
          <Button label="Done" onPress={() => navigation.goBack()} style={{ marginTop: 24, width: "80%" }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Pay Electricity Bill" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Balance */}
        <View style={[styles.balanceBanner, { backgroundColor: "#e65100" }]}>
          <Text style={styles.balanceLabel}>Wallet Balance</Text>
          <Text style={styles.balanceValue}>₦{balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}</Text>
        </View>

        {/* DISCO picker */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Distribution Company (DISCO)</Text>
          <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowPicker(true)} activeOpacity={0.8}>
            <Text style={[styles.pickerText, !disco && { color: COLORS.textMuted }]}>
              {disco ? disco.label : "Tap to select your DISCO"}
            </Text>
            <Text style={styles.pickerArrow}>▾</Text>
          </TouchableOpacity>
          {disco && <Text style={styles.hint}>Coverage: {disco.state}</Text>}
        </Card>

        {/* Meter type */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Meter Type</Text>
          <View style={styles.meterTypeRow}>
            {["prepaid", "postpaid"].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.meterTypeBtn, meterType === t && styles.meterTypeBtnActive]}
                onPress={() => setMeterType(t)}
                activeOpacity={0.8}
              >
                <Text style={[styles.meterTypeText, meterType === t && styles.meterTypeTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Meter number */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Meter Number</Text>
          <TextInput
            style={styles.input}
            value={meter}
            onChangeText={setMeter}
            placeholder="Enter your meter number"
            keyboardType="number-pad"
            placeholderTextColor={COLORS.textMuted}
          />
        </Card>

        {/* Amount */}
        <Card style={styles.card}>
          <Text style={styles.sectionLabel}>Amount (₦)</Text>
          <View style={styles.presets}>
            {AMOUNT_PRESETS.map((p) => (
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
          <Text style={styles.hint}>Minimum ₦500</Text>
        </Card>

        <Button
          label={`Pay Electricity${numAmount >= 500 ? ` — ₦${numAmount.toLocaleString()}` : ""}`}
          onPress={handlePay}
          loading={loading}
          style={{ marginTop: 8 }}
        />
      </ScrollView>

      {/* DISCO picker modal */}
      <Modal visible={showPicker} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowPicker(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Choose Your DISCO</Text>
          <ScrollView>
            {DISCOS.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={[styles.discoRow, disco?.id === d.id && styles.discoRowActive]}
                onPress={() => { setDisco(d); setShowPicker(false); }}
              >
                <Text style={styles.discoLabel}>{d.label}</Text>
                <Text style={styles.discoState}>{d.state}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 40 },

  balanceBanner: { borderRadius: RADIUS.lg, padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  balanceLabel:  { fontSize: FONTS.sm, color: "rgba(255,255,255,0.85)" },
  balanceValue:  { fontSize: FONTS.xl, fontWeight: "800", color: COLORS.white },

  card:         { marginBottom: 14 },
  sectionLabel: { fontSize: FONTS.sm, fontWeight: "700", color: COLORS.textLight, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 },

  pickerBtn:   { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: COLORS.bg },
  pickerText:  { fontSize: FONTS.md, color: COLORS.text, flex: 1 },
  pickerArrow: { fontSize: 16, color: COLORS.purple },
  hint:        { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },

  meterTypeRow:    { flexDirection: "row", gap: 12 },
  meterTypeBtn:    { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: "center", backgroundColor: COLORS.white },
  meterTypeBtnActive:  { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  meterTypeText:       { fontSize: FONTS.md, fontWeight: "600", color: COLORS.textLight },
  meterTypeTextActive: { color: COLORS.orange },

  input: { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 13, fontSize: FONTS.md, color: COLORS.text, backgroundColor: COLORS.bg },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset:         { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.full, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: COLORS.white },
  presetActive:   { borderColor: COLORS.orange, backgroundColor: COLORS.orangeLight },
  presetText:     { fontSize: FONTS.sm, color: COLORS.textLight, fontWeight: "600" },
  presetTextActive:{ color: COLORS.orange },

  // DISCO modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  modalSheet:   { backgroundColor: COLORS.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", padding: 20, paddingBottom: 40 },
  modalTitle:   { fontSize: FONTS.xl, fontWeight: "700", color: COLORS.navy, marginBottom: 16, textAlign: "center" },
  discoRow:     { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border, flexDirection: "row", justifyContent: "space-between" },
  discoRowActive:{ backgroundColor: COLORS.orangeLight },
  discoLabel:   { fontSize: FONTS.md, color: COLORS.text, fontWeight: "600", flex: 1 },
  discoState:   { fontSize: FONTS.sm, color: COLORS.textMuted },

  // Success
  successContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  successIcon:  { fontSize: 72, marginBottom: 16 },
  successTitle: { fontSize: FONTS.h1, fontWeight: "800", color: COLORS.green, marginBottom: 8 },
  successSub:   { fontSize: FONTS.md, color: COLORS.textLight, marginBottom: 32 },
  tokenBox:     { backgroundColor: COLORS.navy, borderRadius: RADIUS.lg, padding: 24, alignItems: "center", width: "100%", marginBottom: 16 },
  tokenLabel:   { fontSize: 11, color: COLORS.textMuted, letterSpacing: 2, marginBottom: 12 },
  tokenValue:   { fontSize: 28, fontWeight: "800", color: COLORS.white, letterSpacing: 3, textAlign: "center" },
  tokenHint:    { fontSize: FONTS.sm, color: COLORS.textMuted, textAlign: "center" },
});
