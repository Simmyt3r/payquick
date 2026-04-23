# PayQuick — VTU Utility App

A production-ready React Native Android app for buying airtime, data, paying electricity bills, and subscribing to cable TV in Nigeria.

**Stack:** React Native (Expo) · Firebase Auth · Firestore · Cloud Functions · Flutterwave · VTPass

---

## Project Structure

```
payquick-vtu-app/
├── App.js                          ← Entry point, auth gate
├── firebase.js                     ← Firebase config (EDIT THIS FIRST)
├── app.json                        ← Expo app config
├── eas.json                        ← EAS Build profiles
├── babel.config.js
├── package.json
├── firestore.rules                 ← Deploy before going live
├── firestore.indexes.json          ← Deploy with rules
│
├── screens/
│   ├── LoginScreen.js
│   ├── RegisterScreen.js
│   ├── DashboardScreen.js          ← Home with wallet card + services
│   ├── FundWalletScreen.js         ← Flutterwave payment
│   ├── BuyAirtimeScreen.js         ← MTN / Airtel / Glo / 9mobile
│   ├── BuyDataScreen.js            ← Data bundles (fetched from VTPass)
│   ├── ElectricityScreen.js        ← PHCN / DISCO payment + token display
│   ├── CableTVScreen.js            ← DSTV / GOtv / Startimes
│   └── TransactionHistoryScreen.js ← Full history with filter tabs
│
├── components/
│   └── UI.js                       ← Button, Input, Card, ScreenHeader, Badge
│
├── navigation/
│   └── AppNavigator.js             ← Bottom tabs + stack navigator
│
├── hooks/
│   └── useUser.js                  ← useUser() + useTransactions() hooks
│
├── utils/
│   └── theme.js                    ← All colors, fonts, spacing, shadows
│
└── functions/
    ├── index.js                    ← All 6 Cloud Functions
    └── package.json
```

---

## Step 1 — Configure Firebase

1. Open `firebase.js`
2. Replace the placeholder values with your actual Firebase config:

```javascript
const firebaseConfig = {
  apiKey:            "your-api-key",
  authDomain:        "your-project.firebaseapp.com",
  projectId:         "your-project-id",
  storageBucket:     "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId:             "your-app-id",
};
```

Get this from: Firebase Console → Project Settings → Your Apps → Web

---

## Step 2 — Configure Flutterwave

1. Open `screens/FundWalletScreen.js`
2. Replace the placeholder with your Flutterwave **Public Key** (NOT your secret key):

```javascript
const FLW_PUBLIC_KEY = "FLWPUBK_TEST-your-actual-public-key";
```

Get this from: Flutterwave Dashboard → Settings → API → Public Key

---

## Step 3 — Configure VTPass

1. Open `screens/BuyDataScreen.js` and `screens/CableTVScreen.js`
2. Replace the placeholder username and password:

```javascript
const VTPASS_USER = "your-vtpass-email@gmail.com";
const VTPASS_PASS = "your-vtpass-password";
```

These are only needed for fetching plan lists (GET requests with no money involved). The actual purchases go through Cloud Functions.

---

## Step 4 — Deploy Cloud Functions

Using StackBlitz (online) or any terminal:

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login --no-localhost

# Go into functions folder, install dependencies
cd functions
npm install

# Set your secret keys as environment config
firebase functions:config:set \
  vtpass.username="your@email.com" \
  vtpass.password="your-vtpass-password" \
  vtpass.apikey="your-vtpass-api-key" \
  flutterwave.secret_key="FLWSECK_TEST-xxx" \
  flutterwave.webhook_secret="your-webhook-secret-string"

# Deploy functions
cd ..
firebase deploy --only functions
```

After deploying, copy the `flutterwaveWebhook` URL — it looks like:
```
https://us-central1-YOUR-PROJECT.cloudfunctions.net/flutterwaveWebhook
```

---

## Step 5 — Configure Flutterwave Webhook

1. Go to Flutterwave Dashboard → Settings → Webhooks
2. Paste your `flutterwaveWebhook` URL
3. Set the Hash to match your `flutterwave.webhook_secret` value

This is critical — without this, wallet funding won't work.

---

## Step 6 — Run the App (Expo Snack)

**Option A — Expo Snack (fully online):**
1. Go to https://snack.expo.dev
2. Upload all files OR paste the contents of each file
3. Add dependencies listed in `package.json`
4. Scan QR code with Expo Go app on your Android phone

**Option B — EAS Build (build real APK):**
```bash
npm install -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview   # Test APK
eas build -p android --profile production # Play Store AAB
```

---

## Step 7 — Go Live Checklist

Before switching from test to production:

- [ ] Change `VTPASS_BASE` in `functions/index.js`:
  ```
  const VTPASS_BASE = "https://vtpass.com/api";  // remove "sandbox."
  ```
- [ ] Switch Flutterwave keys from `FLWPUBK_TEST-` to `FLWPUBK-` (live)
- [ ] Update Firebase Functions config with live keys
- [ ] Deploy Firestore security rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Fund VTPass live merchant wallet (minimum ₦5,000 recommended)
- [ ] Test one real ₦50 transaction end-to-end
- [ ] Change app version in `app.json` to `"1.0.0"` if not already

---

## VTPass Service IDs

| Service        | serviceID        |
|----------------|------------------|
| MTN Airtime    | `mtn`            |
| Airtel Airtime | `airtel`         |
| Glo Airtime    | `glo`            |
| 9mobile Airtime| `etisalat`       |
| MTN Data       | `mtn-data`       |
| Airtel Data    | `airtel-data`    |
| Glo Data       | `glo-data`       |
| 9mobile Data   | `etisalat-data`  |
| DSTV           | `dstv`           |
| GOtv           | `gotv`           |
| Startimes      | `startimes`      |
| Ikeja Electric | `ikeja-electric` |
| Eko Electric   | `eko-electric`   |
| Abuja Electric | `abuja-electric` |
| Kano Electric  | `kano-electric`  |
| PH Electric    | `portharcourt-electric` |
| Jos Electric   | `jos-electric`   |
| Ibadan Electric| `ibadan-electric`|
| Kaduna Electric| `kaduna-electric`|
| Enugu Electric | `enugu-electric` |

---

## Test Credentials

**Flutterwave Test Card:**
- Card: `5531 8866 5214 2950`
- CVV: `564`
- Expiry: `09/32`
- PIN: `3310`
- OTP: `12345`

**VTPass Sandbox:** Uses `sandbox.vtpass.com` — no real money

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Wallet not crediting after payment | Webhook not configured | Set webhook URL in Flutterwave dashboard |
| "unauthenticated" error | Session expired | Sign out and sign in again |
| VTPass "Invalid token" | Wrong credentials in functions config | Re-run `firebase functions:config:set` |
| Data plans not loading | VTPass API unreachable | Fallback hardcoded plans are used automatically |
| Balance not deducting | Cloud Function not deployed | Run `firebase deploy --only functions` |
| App crashes on start | Firebase config wrong | Double-check all values in `firebase.js` |

---

## Support Resources

- Firebase Docs: https://firebase.google.com/docs
- Expo Docs: https://docs.expo.dev
- VTPass API Docs: https://vtpass.com/documentation
- Flutterwave Docs: https://developer.flutterwave.com
- EAS Build: https://docs.expo.dev/build/introduction
