// ─────────────────────────────────────────────────────────────
// firebase.js
// Replace the placeholder values below with YOUR Firebase config.
// Get it from: Firebase Console → Project Settings → Your apps → Web
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey:            "PASTE_YOUR_API_KEY_HERE",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const app = initializeApp(firebaseConfig);

// Auth with persistence so users stay logged in after closing app
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db        = getFirestore(app);
export const functions = getFunctions(app);
