// SaaFine.js with Firestore (Google Sheets Sync Disabled until Apps Script upgrade)
import { db } from "./firebase.js";
import dotenv from "dotenv";

dotenv.config();

// ---------- READ ----------
async function readSaaFine() {
  if (!db) {
    console.error("Firestore not initialized.");
    return [];
  }

  try {
    const snapshot = await db.collection("saafine").orderBy("createdAt", "desc").get();
    if (!snapshot.empty) {
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
    return []; // No records yet
  } catch (err) {
    console.error("Firestore SaaFine read error:", err.message);
    return [];
  }
}

// ---------- APPEND ----------
async function appendSaaFine(newRecord) {
  const { id, name, date, baseAmount, surcharge, paymentDeadline, reason, mail, status } = newRecord;

  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).set({
    id: String(id),
    name,
    date,
    baseAmount: Number(baseAmount) || 50,
    surcharge: Number(surcharge) || 25,
    paymentDeadline,
    reason,
    mail,
    status: status || "UNPAID",
    createdAt: new Date().toISOString(),
  });
  console.log(`Firestore backup saved for SaaFine ID ${id}`);

  // Dual-Sync to Google Sheets disabled as requested
  return { updatedCells: 9 };
}

// ---------- UPDATE ----------
async function updateSaaFine(id, updatedValues) {
  // Allow partial updates
  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).set(
    {
      ...updatedValues,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { updatedCells: 1 };
}

// ---------- DELETE ----------
async function deleteSaaFine(id) {
  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).delete();

  return { success: true };
}

export { readSaaFine, appendSaaFine, updateSaaFine, deleteSaaFine };