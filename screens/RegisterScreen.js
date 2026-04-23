// screens/RegisterScreen.js
import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Button, Input } from "../components/UI";
import { COLORS, FONTS, RADIUS } from "../utils/theme";

export default function RegisterScreen({ navigation }) {
  const [form,    setForm]    = useState({ name: "", phone: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [errors,  setErrors]  = useState({});

  const set = (field) => (val) => {
    setForm((f) => ({ ...f, [field]: val }));
    setErrors((e) => ({ ...e, [field]: "" }));
  };

  const validate = () => {
    const e = {};
    if (!form.name.trim())               e.name     = "Full name is required";
    if (!/^0[789][01]\d{8}$/.test(form.phone))
                                          e.phone    = "Enter a valid Nigerian phone number (e.g. 08012345678)";
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email   = "Enter a valid email address";
    if (form.password.length < 6)         e.password = "Password must be at least 6 characters";
    if (form.password !== form.confirm)   e.confirm  = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);

      await setDoc(doc(db, "users", cred.user.uid), {
        name:          form.name.trim(),
        phone:         form.phone.trim(),
        email:         form.email.trim().toLowerCase(),
        walletBalance: 0,
        createdAt:     serverTimestamp(),
      });
      // App.js auto-navigates on auth state change
    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "An account with this email already exists. Please log in.",
        "auth/weak-password":        "Password is too weak. Choose a stronger one.",
        "auth/invalid-email":        "Invalid email address.",
      };
      Alert.alert("Registration Failed", msgs[err.code] || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "name",     label: "Full Name",      placeholder: "John Doe",       secure: false, kb: "default"    },
    { key: "phone",    label: "Phone Number",   placeholder: "08012345678",    secure: false, kb: "phone-pad"  },
    { key: "email",    label: "Email Address",  placeholder: "you@example.com",secure: false, kb: "email-address"},
    { key: "password", label: "Password",       placeholder: "Min. 6 characters", secure: true,kb: "default"  },
    { key: "confirm",  label: "Confirm Password",placeholder: "Re-enter password", secure: true,kb: "default" },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar} />

        <View style={styles.topArea}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.heading}>Create Account</Text>
          <Text style={styles.sub}>Fill in your details to get started</Text>
        </View>

        <View style={styles.card}>
          {fields.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              value={form[f.key]}
              onChangeText={set(f.key)}
              placeholder={f.placeholder}
              secureTextEntry={f.secure}
              keyboardType={f.kb}
              autoCapitalize="none"
              autoCorrect={false}
              error={errors[f.key]}
            />
          ))}

          <Button
            label="Create My Account"
            onPress={handleRegister}
            loading={loading}
            style={{ marginTop: 8 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.footerLink}>Log In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { flexGrow: 1, paddingBottom: 32 },
  topBar:    { height: 6, backgroundColor: COLORS.purple },
  topArea:   { padding: 24, paddingTop: 20 },
  back:      { marginBottom: 16 },
  backText:  { color: COLORS.purple, fontSize: FONTS.md, fontWeight: "600" },
  heading:   { fontSize: FONTS.h1, fontWeight: "800", color: COLORS.navy, marginBottom: 4 },
  sub:       { fontSize: FONTS.sm, color: COLORS.textLight },
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
  footer:    { flexDirection: "row", justifyContent: "center", paddingVertical: 24 },
  footerText:{ fontSize: FONTS.md, color: COLORS.textLight },
  footerLink:{ fontSize: FONTS.md, color: COLORS.purple, fontWeight: "700" },
});
