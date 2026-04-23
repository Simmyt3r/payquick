// hooks/useUser.js
import { useState, useEffect } from "react";
import {
  doc, collection, query, where, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { auth, db } from "../firebase";

// Real-time wallet balance + user profile
export function useUser() {
  const [userData, setUserData] = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const unsub = onSnapshot(
      doc(db, "users", uid),
      (snap) => { setUserData(snap.exists() ? { id: snap.id, ...snap.data() } : null); setLoading(false); },
      () => setLoading(false)
    );
    return unsub;
  }, []);

  return { userData, loading };
}

// Paginated real-time transaction history
export function useTransactions(pageSize = 20) {
  const [txns,    setTxns]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) { setLoading(false); return; }
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(pageSize)
    );
    const unsub = onSnapshot(q, (snap) => {
      setTxns(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [pageSize]);

  return { txns, loading };
}
