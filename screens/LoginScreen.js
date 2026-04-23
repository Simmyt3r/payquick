// screens/LoginScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Image, KeyboardAvoidingView, Platform,
} from "react-native";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { Button, Input } from "../components/UI";
import { COLORS, FONTS, RADIUS } from "../utils/theme";

export default function LoginScreen({ navigation }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [errors,   setErrors]   = useState({});

  const validate = () => {
    const e = {};
    if (!email.trim())    e.email    = "Email is required";
    if (!password)        e.password = "Password is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // App.js handles navigation via onAuthStateChanged
    } catch (err) {
      const msgs = {
        "auth/user-not-found":  "No account found with this email.",
        "auth/wrong-password":  "Incorrect password. Please try again.",
        "auth/invalid-email":   "Please enter a valid email address.",
        "auth/too-many-requests": "Too many attempts. Please wait and try again.",
      };
      Alert.alert("Login Failed", msgs[err.code] || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header gradient bar */}
        <View style={styles.topBar} />

        {/* Logo area */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoIcon}>💳</Text>
          </View>
          <Text style={styles.appName}>PayQuick</Text>
          <Text style={styles.tagline}>Your utility payments, simplified</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.heading}>Welcome back</Text>
          <Text style={styles.sub}>Log in to access your wallet</Text>

          <Input
            label="Email Address"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors({ ...errors, email: "" }); }}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            error={errors.email}
          />

          <Input
            label="Password"
            value={password}
            onChangeText={(t) => { setPassword(t); setErrors({ ...errors, password: "" }); }}
            placeholder="Your password"
            secureTextEntry
            error={errors.password}
          />

          <Button
            label="Log In"
            onPress={handleLogin}
            loading={loading}
            style={{ marginTop: 8 }}
          />
        </View>

        {/* Sign-up link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Register")}>
            <Text style={styles.footerLink}>Create one</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { flexGrow: 1 },
  topBar:    { height: 6, backgroundColor: COLORS.purple },
  logoArea:  { alignItems: "center", paddingTop: 48, paddingBottom: 28 },
  logoCircle:{
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.purple, justifyContent: "center", alignItems: "center",
    marginBottom: 12,
    shadowColor: COLORS.purple,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoIcon:  { fontSize: 36 },
  appName:   { fontSize: FONTS.h1, fontWeight: "800", color: COLORS.navy, letterSpacing: -0.5 },
  tagline:   { fontSize: FONTS.sm, color: COLORS.textLight, marginTop: 4 },
  card: {
    marginHorizontal: 20,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  heading:   { fontSize: FONTS.xxl, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  sub:       { fontSize: FONTS.sm, color: COLORS.textLight, marginBottom: 24 },
  footer:    { flexDirection: "row", justifyContent: "center", paddingVertical: 28 },
  footerText:{ fontSize: FONTS.md, color: COLORS.textLight },
  footerLink:{ fontSize: FONTS.md, color: COLORS.purple, fontWeight: "700" },
});
