// screens/DashboardScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from "react-native";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useUser } from "../hooks/useUser";
import { useTransactions } from "../hooks/useUser";
import { COLORS, FONTS, RADIUS, SHADOW } from "../utils/theme";

const SERVICES = [
  { id: "airtime",    label: "Buy Airtime",  emoji: "📱", color: "#e3f2fd", accent: "#1565C0", screen: "BuyAirtime"  },
  { id: "data",       label: "Buy Data",     emoji: "🌐", color: "#e8f5e9", accent: "#2E7D32", screen: "BuyData"     },
  { id: "electricity",label: "Electricity",  emoji: "💡", color: "#fff3e0", accent: "#E65100", screen: "Electricity" },
  { id: "cable",      label: "Cable TV",     emoji: "📺", color: "#fce4ec", accent: "#880E4F", screen: "CableTV"     },
];

const STATUS_COLOR = {
  success: COLORS.green,
  pending: COLORS.orange,
  failed:  COLORS.red,
};

function formatNaira(n = 0) {
  return "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function timeAgo(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)     return "Just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString("en-NG", { day: "2-digit", month: "short" });
}

export default function DashboardScreen({ navigation }) {
  const { userData }       = useUser();
  const { txns, loading }  = useTransactions(3);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);

  const firstName = userData?.name?.split(" ")[0] ?? "User";

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const handleLogout = () =>
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => signOut(auth) },
    ]);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.purple} />}
    >
      {/* ── Top header ─────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {firstName} 👋</Text>
          <Text style={styles.greetingSub}>Welcome to PayQuick</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>⏻</Text>
        </TouchableOpacity>
      </View>

      {/* ── Wallet card ────────────────────────────────── */}
      <View style={styles.walletCard}>
        <View style={styles.walletCardInner}>
          <View style={styles.walletTop}>
            <View>
              <Text style={styles.walletLabel}>Available Balance</Text>
              <TouchableOpacity onPress={() => setBalanceHidden((h) => !h)}>
                <Text style={styles.walletBalance}>
                  {balanceHidden ? "₦ ••••••" : formatNaira(userData?.walletBalance)}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setBalanceHidden((h) => !h)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{balanceHidden ? "👁️" : "🙈"}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.fundBtn}
            onPress={() => navigation.navigate("FundWallet")}
            activeOpacity={0.85}
          >
            <Text style={styles.fundBtnText}>+ Fund Wallet</Text>
          </TouchableOpacity>
        </View>
        {/* Decorative circles */}
        <View style={[styles.circle, styles.circle1]} />
        <View style={[styles.circle, styles.circle2]} />
      </View>

      {/* ── Services grid ──────────────────────────────── */}
      <Text style={styles.sectionTitle}>Quick Services</Text>
      <View style={styles.grid}>
        {SERVICES.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.serviceCard, { backgroundColor: s.color }]}
            onPress={() => navigation.navigate(s.screen)}
            activeOpacity={0.8}
          >
            <Text style={styles.serviceEmoji}>{s.emoji}</Text>
            <Text style={[styles.serviceLabel, { color: s.accent }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Recent transactions ────────────────────────── */}
      <View style={styles.recentHeader}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <TouchableOpacity onPress={() => navigation.navigate("History")}>
          <Text style={styles.seeAll}>See all →</Text>
        </TouchableOpacity>
      </View>

      {txns.length === 0 ? (
        <View style={styles.emptyTxn}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      ) : (
        txns.map((t) => (
          <View key={t.id} style={styles.txnRow}>
            <View style={styles.txnLeft}>
              <View style={[styles.txnDot, { backgroundColor: STATUS_COLOR[t.status] + "22" }]}>
                <View style={[styles.txnDotInner, { backgroundColor: STATUS_COLOR[t.status] }]} />
              </View>
              <View>
                <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
                <Text style={styles.txnTime}>{timeAgo(t.createdAt)}</Text>
              </View>
            </View>
            <Text style={[styles.txnAmount, { color: t.type === "funding" ? COLORS.green : COLORS.red }]}>
              {t.type === "funding" ? "+" : "-"}{formatNaira(t.amount)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: COLORS.bg },
  content: { paddingBottom: 100 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
  },
  greeting:    { fontSize: FONTS.xl, fontWeight: "700", color: COLORS.navy },
  greetingSub: { fontSize: FONTS.sm, color: COLORS.textLight, marginTop: 2 },
  logoutBtn:   { padding: 8 },
  logoutText:  { fontSize: 22, color: COLORS.textLight },

  // Wallet card
  walletCard: {
    margin: 16,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.purple,
    overflow: "hidden",
    ...SHADOW.medium,
  },
  walletCardInner: {
    padding: 24,
    zIndex: 2,
  },
  walletTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  walletLabel:   { fontSize: FONTS.sm, color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  walletBalance: { fontSize: 32, fontWeight: "800", color: COLORS.white, letterSpacing: -0.5 },
  eyeBtn:        { padding: 4 },
  eyeIcon:       { fontSize: 20 },
  fundBtn: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.5)",
    borderRadius: RADIUS.full,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignSelf: "flex-start",
  },
  fundBtnText: { color: COLORS.white, fontWeight: "700", fontSize: FONTS.md },
  circle: {
    position: "absolute",
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  circle1: { width: 160, height: 160, top: -40, right: -30 },
  circle2: { width: 100, height: 100, bottom: -20, right: 60 },

  // Services
  sectionTitle: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: COLORS.navy,
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  serviceCard: {
    width: "46%",
    margin: "2%",
    borderRadius: RADIUS.lg,
    padding: 20,
    alignItems: "center",
    ...SHADOW.small,
  },
  serviceEmoji: { fontSize: 32, marginBottom: 8 },
  serviceLabel: { fontSize: FONTS.sm, fontWeight: "700" },

  // Transactions
  recentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  seeAll: { fontSize: FONTS.sm, color: COLORS.purple, fontWeight: "600" },
  emptyTxn: { alignItems: "center", paddingVertical: 24 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyText: { fontSize: FONTS.sm, color: COLORS.textMuted },
  txnRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: RADIUS.md,
    padding: 14,
    ...SHADOW.small,
  },
  txnLeft:     { flexDirection: "row", alignItems: "center", flex: 1 },
  txnDot:      { width: 36, height: 36, borderRadius: 18, justifyContent: "center", alignItems: "center", marginRight: 12 },
  txnDotInner: { width: 10, height: 10, borderRadius: 5 },
  txnDesc:     { fontSize: FONTS.sm, fontWeight: "600", color: COLORS.text, maxWidth: 180 },
  txnTime:     { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  txnAmount:   { fontSize: FONTS.md, fontWeight: "700" },
});
