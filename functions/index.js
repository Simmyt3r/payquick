// functions/index.js — Complete VTU Cloud Functions Backend
// Deploy with: firebase deploy --only functions

const functions = require("firebase-functions");
const admin     = require("firebase-admin");
const axios     = require("axios");

admin.initializeApp();
const db = admin.firestore();

// ─────────────────────────────────────────────────────────────
// CONFIG HELPERS
// Set these via: firebase functions:config:set vtpass.username="x"
// ─────────────────────────────────────────────────────────────
const cfg = () => functions.config();

// VTPass base URL — use sandbox for testing, switch to live for production
const VTPASS_BASE = "https://sandbox.vtpass.com/api";
// const VTPASS_BASE = "https://vtpass.com/api";  // ← uncomment for production

// ─────────────────────────────────────────────────────────────
// HELPER: Get a fresh VTPass auth token
// VTPass tokens expire — we fetch one per request
// ─────────────────────────────────────────────────────────────
async function getVTPassToken() {
  const res = await axios.post(`${VTPASS_BASE}/token`, {
    username: cfg().vtpass.username,
    password: cfg().vtpass.password,
  });
  if (!res.data?.token) throw new Error("Failed to get VTPass token");
  return res.data.token;
}

// ─────────────────────────────────────────────────────────────
// HELPER: Safely refund a user's wallet
// Always call this if VTPass fails after deducting balance
// ─────────────────────────────────────────────────────────────
async function refundUser(userId, amount, txRef, reason) {
  await db.runTransaction(async (t) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await t.get(userRef);
    t.update(userRef, { walletBalance: (userDoc.data().walletBalance || 0) + amount });
    t.update(txRef, { status: "failed", failureReason: reason });
  });
}

// ─────────────────────────────────────────────────────────────
// FUNCTION 1: Flutterwave Webhook
// Flutterwave calls this URL when a payment is confirmed.
// Endpoint: POST /flutterwaveWebhook
// ─────────────────────────────────────────────────────────────
exports.flutterwaveWebhook = functions.https.onRequest(async (req, res) => {
  // Verify the request is really from Flutterwave
  const signature    = req.headers["verif-hash"];
  const secretHash   = cfg().flutterwave.webhook_secret;
  if (!signature || signature !== secretHash) {
    console.error("Webhook signature mismatch");
    return res.status(401).json({ error: "Unauthorized" });
  }

  const payload = req.body;
  console.log("Webhook received:", JSON.stringify(payload));

  if (payload.status !== "successful") {
    return res.status(200).json({ received: true, note: "Non-successful payment ignored" });
  }

  const txRef  = payload.txRef || payload.tx_ref;
  const amount = parseFloat(payload.amount || 0);

  // txRef format we set: FUND_{userId}_{timestamp}
  const parts  = txRef?.split("_");
  if (!parts || parts[0] !== "FUND" || !parts[1]) {
    return res.status(400).json({ error: "Unrecognized txRef format" });
  }
  const userId = parts[1];

  // Check we haven't processed this reference already (idempotency)
  const existing = await db.collection("transactions")
    .where("reference", "==", txRef)
    .where("status", "==", "success")
    .get();

  if (!existing.empty) {
    console.log("Duplicate webhook — already processed:", txRef);
    return res.status(200).json({ received: true, note: "Already processed" });
  }

  // Credit the user's wallet atomically
  await db.runTransaction(async (t) => {
    const userRef = db.collection("users").doc(userId);
    const userDoc = await t.get(userRef);
    if (!userDoc.exists) throw new Error(`User ${userId} not found`);

    const newBalance = (userDoc.data().walletBalance || 0) + amount;
    t.update(userRef, { walletBalance: newBalance });

    const txDocRef = db.collection("transactions").doc();
    t.set(txDocRef, {
      userId,
      type:        "funding",
      amount,
      status:      "success",
      reference:   txRef,
      description: `Wallet funded with ₦${amount.toLocaleString()}`,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  console.log(`Credited ₦${amount} to user ${userId}`);
  return res.status(200).json({ received: true });
});

// ─────────────────────────────────────────────────────────────
// FUNCTION 2: Buy Airtime
// ─────────────────────────────────────────────────────────────
exports.buyAirtime = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Please log in.");

  const { phone, amount, network } = data;
  const userId = context.auth.uid;

  // Input validation
  if (!phone || !/^0[789][01]\d{8}$/.test(phone))
    throw new functions.https.HttpsError("invalid-argument", "Invalid phone number.");
  if (!amount || amount < 50 || amount > 50000)
    throw new functions.https.HttpsError("invalid-argument", "Amount must be between ₦50 and ₦50,000.");
  if (!["mtn", "airtel", "glo", "etisalat"].includes(network))
    throw new functions.https.HttpsError("invalid-argument", "Invalid network.");

  const userRef = db.collection("users").doc(userId);

  // Step 1: Deduct from wallet (fail fast if insufficient funds)
  const { txRef } = await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const balance = userDoc.data()?.walletBalance || 0;
    if (balance < amount)
      throw new functions.https.HttpsError("failed-precondition", `Insufficient balance. Your wallet has ₦${balance.toLocaleString()}.`);

    t.update(userRef, { walletBalance: balance - amount });
    const txDocRef = db.collection("transactions").doc();
    t.set(txDocRef, {
      userId,
      type:        "airtime",
      amount,
      status:      "pending",
      description: `${network.toUpperCase()} ₦${amount} Airtime for ${phone}`,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    return { txRef: txDocRef };
  });

  // Step 2: Call VTPass
  try {
    const token     = await getVTPassToken();
    const requestId = `AIRTIME_${userId.slice(0,6)}_${Date.now()}`;

    const vtRes = await axios.post(
      `${VTPASS_BASE}/pay`,
      { request_id: requestId, serviceID: network, amount, phone },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const vtData = vtRes.data;
    console.log("VTPass response:", JSON.stringify(vtData));

    if (vtData.code === "000") {
      await txRef.update({
        status:    "success",
        vtpassRef: vtData.content?.transactions?.transactionId || requestId,
      });
      return { success: true, message: `₦${amount} ${network.toUpperCase()} airtime sent to ${phone} successfully!` };
    } else {
      await refundUser(userId, amount, txRef, vtData.response_description || "VTPass error");
      throw new functions.https.HttpsError("internal", "Airtime purchase failed. Your wallet has been refunded.");
    }
  } catch (err) {
    if (err.code) throw err; // rethrow HttpsError
    await refundUser(userId, amount, txRef, err.message || "Network error");
    throw new functions.https.HttpsError("internal", "Service temporarily unavailable. Your wallet has been refunded.");
  }
});

// ─────────────────────────────────────────────────────────────
// FUNCTION 3: Buy Data Bundle
// ─────────────────────────────────────────────────────────────
exports.buyData = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Please log in.");

  const { phone, variation_code, amount, network } = data;
  const userId  = context.auth.uid;
  const userRef = db.collection("users").doc(userId);

  if (!phone || !/^0[789][01]\d{8}$/.test(phone))
    throw new functions.https.HttpsError("invalid-argument", "Invalid phone number.");
  if (!variation_code)
    throw new functions.https.HttpsError("invalid-argument", "No data plan selected.");
  if (!amount || amount < 50)
    throw new functions.https.HttpsError("invalid-argument", "Invalid amount.");

  const serviceID = `${network.toLowerCase()}-data`;

  const { txRef } = await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const balance = userDoc.data()?.walletBalance || 0;
    if (balance < amount)
      throw new functions.https.HttpsError("failed-precondition", `Insufficient balance. Your wallet has ₦${balance.toLocaleString()}.`);

    t.update(userRef, { walletBalance: balance - amount });
    const txDocRef = db.collection("transactions").doc();
    t.set(txDocRef, {
      userId,
      type:        "data",
      amount,
      status:      "pending",
      description: `${network.toUpperCase()} Data Bundle for ${phone}`,
      variationCode: variation_code,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    return { txRef: txDocRef };
  });

  try {
    const token     = await getVTPassToken();
    const requestId = `DATA_${userId.slice(0,6)}_${Date.now()}`;

    const vtRes = await axios.post(
      `${VTPASS_BASE}/pay`,
      { request_id: requestId, serviceID, billersCode: phone, variation_code, amount, phone },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const vtData = vtRes.data;
    if (vtData.code === "000") {
      await txRef.update({ status: "success", vtpassRef: vtData.content?.transactions?.transactionId || requestId });
      return { success: true, message: `Data bundle activated for ${phone}!` };
    } else {
      await refundUser(userId, amount, txRef, vtData.response_description || "VTPass error");
      throw new functions.https.HttpsError("internal", "Data purchase failed. Your wallet has been refunded.");
    }
  } catch (err) {
    if (err.code) throw err;
    await refundUser(userId, amount, txRef, err.message);
    throw new functions.https.HttpsError("internal", "Service unavailable. Your wallet has been refunded.");
  }
});

// ─────────────────────────────────────────────────────────────
// FUNCTION 4: Pay Electricity Bill
// ─────────────────────────────────────────────────────────────
exports.payElectricity = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Please log in.");

  const { meterNumber, amount, disco, meterType } = data;
  const userId  = context.auth.uid;
  const userRef = db.collection("users").doc(userId);

  if (!meterNumber?.trim())
    throw new functions.https.HttpsError("invalid-argument", "Meter number is required.");
  if (!amount || amount < 500)
    throw new functions.https.HttpsError("invalid-argument", "Minimum electricity payment is ₦500.");
  if (!disco)
    throw new functions.https.HttpsError("invalid-argument", "Distribution company (DISCO) is required.");
  if (!["prepaid", "postpaid"].includes(meterType))
    throw new functions.https.HttpsError("invalid-argument", "Invalid meter type.");

  const { txRef } = await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const balance = userDoc.data()?.walletBalance || 0;
    if (balance < amount)
      throw new functions.https.HttpsError("failed-precondition", `Insufficient balance. Your wallet has ₦${balance.toLocaleString()}.`);

    t.update(userRef, { walletBalance: balance - amount });
    const txDocRef = db.collection("transactions").doc();
    t.set(txDocRef, {
      userId,
      type:        "electricity",
      amount,
      status:      "pending",
      description: `${disco} Electricity — Meter ${meterNumber}`,
      meterType,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    return { txRef: txDocRef };
  });

  try {
    const token     = await getVTPassToken();
    const requestId = `ELEC_${userId.slice(0,6)}_${Date.now()}`;

    const vtRes = await axios.post(
      `${VTPASS_BASE}/pay`,
      {
        request_id:     requestId,
        serviceID:      disco,
        billersCode:    meterNumber.trim(),
        variation_code: meterType,
        amount,
        phone:          "08000000000",  // placeholder; real phone optional
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const vtData = vtRes.data;
    if (vtData.code === "000") {
      const tokenValue = vtData.content?.transactions?.token || null;
      await txRef.update({
        status:     "success",
        tokenValue: tokenValue || "",
        vtpassRef:  vtData.content?.transactions?.transactionId || requestId,
      });
      return {
        success: true,
        message: `Electricity payment of ₦${amount.toLocaleString()} successful!`,
        token:   tokenValue,
      };
    } else {
      await refundUser(userId, amount, txRef, vtData.response_description || "VTPass error");
      throw new functions.https.HttpsError("internal", "Payment failed. Your wallet has been refunded.");
    }
  } catch (err) {
    if (err.code) throw err;
    await refundUser(userId, amount, txRef, err.message);
    throw new functions.https.HttpsError("internal", "Service unavailable. Your wallet has been refunded.");
  }
});

// ─────────────────────────────────────────────────────────────
// FUNCTION 5: Pay Cable TV
// ─────────────────────────────────────────────────────────────
exports.payCableTV = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Please log in.");

  const { smartcardNumber, variation_code, amount, provider } = data;
  const userId  = context.auth.uid;
  const userRef = db.collection("users").doc(userId);

  if (!smartcardNumber?.trim())
    throw new functions.https.HttpsError("invalid-argument", "Smartcard/IUC number is required.");
  if (!variation_code)
    throw new functions.https.HttpsError("invalid-argument", "No subscription plan selected.");
  if (!amount || amount < 100)
    throw new functions.https.HttpsError("invalid-argument", "Invalid amount.");
  if (!["dstv", "gotv", "startimes"].includes(provider))
    throw new functions.https.HttpsError("invalid-argument", "Invalid cable TV provider.");

  const { txRef } = await db.runTransaction(async (t) => {
    const userDoc = await t.get(userRef);
    const balance = userDoc.data()?.walletBalance || 0;
    if (balance < amount)
      throw new functions.https.HttpsError("failed-precondition", `Insufficient balance. Your wallet has ₦${balance.toLocaleString()}.`);

    t.update(userRef, { walletBalance: balance - amount });
    const txDocRef = db.collection("transactions").doc();
    t.set(txDocRef, {
      userId,
      type:        "cabletv",
      amount,
      status:      "pending",
      description: `${provider.toUpperCase()} Subscription — ${smartcardNumber}`,
      variation_code,
      createdAt:   admin.firestore.FieldValue.serverTimestamp(),
    });
    return { txRef: txDocRef };
  });

  try {
    const token     = await getVTPassToken();
    const requestId = `CABLE_${userId.slice(0,6)}_${Date.now()}`;

    const vtRes = await axios.post(
      `${VTPASS_BASE}/pay`,
      {
        request_id:        requestId,
        serviceID:         provider,
        billersCode:       smartcardNumber.trim(),
        variation_code,
        amount,
        phone:             "08000000000",
        subscription_type: "change",
      },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );

    const vtData = vtRes.data;
    if (vtData.code === "000") {
      await txRef.update({ status: "success", vtpassRef: vtData.content?.transactions?.transactionId || requestId });
      return { success: true, message: `${provider.toUpperCase()} subscription activated!` };
    } else {
      await refundUser(userId, amount, txRef, vtData.response_description || "VTPass error");
      throw new functions.https.HttpsError("internal", "Subscription failed. Your wallet has been refunded.");
    }
  } catch (err) {
    if (err.code) throw err;
    await refundUser(userId, amount, txRef, err.message);
    throw new functions.https.HttpsError("internal", "Service unavailable. Your wallet has been refunded.");
  }
});

// ─────────────────────────────────────────────────────────────
// FUNCTION 6: Get User Profile (for admin/debug use)
// ─────────────────────────────────────────────────────────────
exports.getUserProfile = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Please log in.");
  const doc = await db.collection("users").doc(context.auth.uid).get();
  if (!doc.exists) throw new functions.https.HttpsError("not-found", "User profile not found.");
  const d = doc.data();
  return { name: d.name, phone: d.phone, email: d.email, walletBalance: d.walletBalance };
});
