// components/UI.js — reusable building blocks used across all screens
import React from "react";
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet, TextInput,
} from "react-native";
import { COLORS, FONTS, RADIUS, SHADOW } from "../utils/theme";

// ─── Button ──────────────────────────────────────────────────
export function Button({ label, onPress, loading, variant = "primary", style }) {
  const bg = variant === "primary"   ? COLORS.purple
           : variant === "success"   ? COLORS.green
           : variant === "danger"    ? COLORS.red
           : variant === "outline"   ? "transparent"
           : COLORS.purple;

  const border = variant === "outline" ? { borderWidth: 1.5, borderColor: COLORS.purple } : {};
  const textCol = variant === "outline" ? COLORS.purple : COLORS.white;

  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: bg }, border, loading && { opacity: 0.6 }, style]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color={textCol} />
        : <Text style={[styles.btnText, { color: textCol }]}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

// ─── Input ───────────────────────────────────────────────────
export function Input({ label, error, style, ...props }) {
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, error && { borderColor: COLORS.red }]}
        placeholderTextColor={COLORS.textMuted}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────
export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ─── ScreenHeader ─────────────────────────────────────────────
export function ScreenHeader({ title, onBack, rightElement }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
        <Text style={styles.backArrow}>←</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 44 }}>{rightElement}</View>
    </View>
  );
}

// ─── Badge ───────────────────────────────────────────────────
export function Badge({ label, color = COLORS.purple }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + "22" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── EmptyState ──────────────────────────────────────────────
export function EmptyState({ icon = "📭", message }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

// ─── Divider ─────────────────────────────────────────────────
export function Divider({ label }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      {label && <Text style={styles.dividerLabel}>{label}</Text>}
      {label && <View style={styles.dividerLine} />}
    </View>
  );
}

const styles = StyleSheet.create({
  // Button
  btn: {
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    ...SHADOW.small,
  },
  btnText: {
    fontSize: FONTS.md,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // Input
  label: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: FONTS.md,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  errorText: {
    color: COLORS.red,
    fontSize: FONTS.sm,
    marginTop: 4,
  },

  // Card
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 16,
    ...SHADOW.small,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  backArrow: {
    fontSize: 22,
    color: COLORS.purple,
    fontWeight: "600",
  },
  headerTitle: {
    fontSize: FONTS.lg,
    fontWeight: "700",
    color: COLORS.text,
  },

  // Badge
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // Empty
  empty: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: FONTS.md, color: COLORS.textMuted, textAlign: "center" },

  // Divider
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerLabel: {
    marginHorizontal: 12,
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
  },
});
