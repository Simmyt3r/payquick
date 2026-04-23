// screens/TransactionHistoryScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Modal, Pressable, ScrollView,
} from "react-native";
import { useTransactions } from "../hooks/useUser";
import { COLORS, FONTS, RADIUS, SHADOW } from "../utils/theme";

const FILTERS = ["All", "Funding", "Airtime", "Data", "Electricity", "Cable TV"];
const TYPE_MAP = { funding: "Funding", airtime: "Airtime", data: "Data", electricity: "Electricity", cabletv: "Cable TV" };
const TYPE_ICON = { funding: "💰", airtime: "📱", data: "🌐", electricity: "💡", cabletv: "📺" };
const STATUS_COLORS = { success: COLORS.green, pending: COLORS.orange, failed: COLORS.red };

function formatNaira(n = 0) {
  return "₦" + Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 });
}
function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-NG", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function TransactionHistoryScreen() {
  const { txns, loading } = useTransactions(50);
  const [filter,   setFilter]   = useState("All");
  const [selected, setSelected] = useState(null);

  const filtered = txns.filter((t) => {
    if (filter === "All")      return true;
    const mapped = TYPE_MAP[t.type] || t.type;
    return mapped === filter;
  });

  const totals = txns.reduce(
    (acc, t) => {
      if (t.status === "success") {
        if (t.type === "funding") acc.funded += t.amount;
        else acc.spent += t.amount;
      }
      return acc;
    },
    { funded: 0, spent: 0 }
  );

  const renderItem = ({ item: t }) => (
    <TouchableOpacity
      style={styles.txnCard}
      onPress={() => setSelected(t)}
      activeOpacity={0.8}
    >
      <View style={[styles.iconCircle, { backgroundColor: STATUS_COLORS[t.status] + "18" }]}>
        <Text style={styles.txnIcon}>{TYPE_ICON[t.type] || "💳"}</Text>
      </View>
      <View style={styles.txnMiddle}>
        <Text style={styles.txnDesc} numberOfLines={1}>{t.description}</Text>
        <View style={styles.txnMeta}>
          <Text style={styles.txnDate}>{formatDate(t.createdAt)}</Text>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[t.status] }]} />
          <Text style={[styles.txnStatus, { color: STATUS_COLORS[t.status] }]}>
            {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
          </Text>
        </View>
      </View>
      <Text style={[
        styles.txnAmount,
        { color: t.type === "funding" ? COLORS.green : COLORS.red },
      ]}>
        {t.type === "funding" ? "+" : "-"}{formatNaira(t.amount)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transaction History</Text>
      </View>

      {/* Summary cards */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { backgroundColor: COLORS.greenLight }]}>
          <Text style={styles.summaryLabel}>Total Funded</Text>
          <Text style={[styles.summaryValue, { color: COLORS.green }]}>{formatNaira(totals.funded)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: COLORS.redLight }]}>
          <Text style={styles.summaryLabel}>Total Spent</Text>
          <Text style={[styles.summaryValue, { color: COLORS.red }]}>{formatNaira(totals.spent)}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersScroll}
        contentContainerStyle={styles.filters}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(t) => t.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyText}>
              {loading ? "Loading transactions..." : `No ${filter.toLowerCase()} transactions yet.`}
            </Text>
          </View>
        }
      />

      {/* Detail modal */}
      <Modal visible={!!selected} transparent animationType="slide">
        <Pressable style={styles.overlay} onPress={() => setSelected(null)} />
        {selected && (
          <View style={styles.detailSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.detailIcon}>{TYPE_ICON[selected.type] || "💳"}</Text>
            <Text style={styles.detailTitle}>{selected.description}</Text>
            <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[selected.status] + "22" }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[selected.status] }]}>
                {selected.status.toUpperCase()}
              </Text>
            </View>
            <View style={styles.detailDivider} />
            {[
              ["Amount",     `${selected.type === "funding" ? "+" : "-"}${formatNaira(selected.amount)}`],
              ["Type",       TYPE_MAP[selected.type] || selected.type],
              ["Date",       formatDate(selected.createdAt)],
              ["Reference",  selected.reference || "—"],
              ...(selected.vtpassRef ? [["VTPass Ref", selected.vtpassRef]] : []),
              ...(selected.tokenValue ? [["Token",     selected.tokenValue]] : []),
            ].map(([label, value]) => (
              <View key={label} style={styles.detailRow}>
                <Text style={styles.detailLabel}>{label}</Text>
                <Text style={styles.detailValue}>{value}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
              <Text style={styles.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingTop: 56, paddingBottom: 16, paddingHorizontal: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { fontSize: FONTS.xl, fontWeight: "700", color: COLORS.navy },

  summaryRow: { flexDirection: "row", padding: 12, gap: 12 },
  summaryCard:{ flex: 1, borderRadius: RADIUS.md, padding: 14 },
  summaryLabel:{ fontSize: FONTS.sm, color: COLORS.textLight, marginBottom: 4 },
  summaryValue:{ fontSize: FONTS.lg, fontWeight: "800" },

  filtersScroll: { maxHeight: 52, flexGrow: 0 },
  filters:  { paddingHorizontal: 12, gap: 8, alignItems: "center", paddingVertical: 8 },
  filterTab:{ paddingHorizontal: 16, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border },
  filterTabActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  filterText:      { fontSize: FONTS.sm, color: COLORS.textLight, fontWeight: "600" },
  filterTextActive:{ color: COLORS.white },

  list:       { padding: 12, paddingTop: 4 },
  txnCard:    { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, borderRadius: RADIUS.md, padding: 14, marginBottom: 8, ...SHADOW.small },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginRight: 12 },
  txnIcon:    { fontSize: 20 },
  txnMiddle:  { flex: 1 },
  txnDesc:    { fontSize: FONTS.sm, fontWeight: "600", color: COLORS.text },
  txnMeta:    { flexDirection: "row", alignItems: "center", marginTop: 3, gap: 6 },
  txnDate:    { fontSize: 11, color: COLORS.textMuted },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  txnStatus:  { fontSize: 11, fontWeight: "600" },
  txnAmount:  { fontSize: FONTS.md, fontWeight: "800" },

  empty:     { alignItems: "center", paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: FONTS.sm, color: COLORS.textMuted },

  // Modal
  overlay:   { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  detailSheet:{ backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, alignItems: "center" },
  sheetHandle:{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, marginBottom: 20 },
  detailIcon: { fontSize: 48, marginBottom: 12 },
  detailTitle:{ fontSize: FONTS.lg, fontWeight: "700", color: COLORS.navy, textAlign: "center", marginBottom: 12 },
  statusBadge:{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: RADIUS.full, marginBottom: 16 },
  statusText: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  detailDivider:{ height: 1, backgroundColor: COLORS.border, width: "100%", marginBottom: 16 },
  detailRow:  { flexDirection: "row", justifyContent: "space-between", width: "100%", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  detailLabel:{ fontSize: FONTS.sm, color: COLORS.textLight },
  detailValue:{ fontSize: FONTS.sm, fontWeight: "600", color: COLORS.text, maxWidth: "60%", textAlign: "right" },
  closeBtn:   { marginTop: 20, backgroundColor: COLORS.purple, borderRadius: RADIUS.full, paddingHorizontal: 48, paddingVertical: 14 },
  closeBtnText:{ color: COLORS.white, fontWeight: "700", fontSize: FONTS.md },
});
