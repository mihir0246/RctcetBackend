// SaaFine.js with Firestore (Google Sheets Sync Disabled until Apps Script upgrade)
import { db } from "./firebase.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;

// ---------- READ ----------
async function readSaaFine() {
  if (!db) {
    console.error("Firestore not initialized.");
    return [];
  }

  try {
    const snapshot = await db.collection("saafine").get();
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
async function appendSaaFine(newRow) {
  const [id, name, date, amount, reason, mail, status] = newRow;

  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).set({
    id: String(id),
    name,
    date,
    amount,
    reason,
    mail,
    status: status || "UNPAID",
    createdAt: new Date().toISOString(),
  });
  console.log(`Firestore backup saved for SaaFine ID ${id}`);

  // Dual-Sync to Google Sheets disabled as servicekey.json is removed in Phase 4
  return { updatedCells: 7 };
}

// ---------- UPDATE ----------
async function updateSaaFine(id, updatedValues) {
  const [idVal, name, date, amount, reason, mail, status] = updatedValues;

  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).set(
    {
      id: String(id),
      name,
      date,
      amount,
      reason,
      mail,
      status,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return { updatedCells: 7 };
}

// ---------- DELETE ----------
async function deleteSaaFine(id) {
  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("saafine").doc(String(id)).delete();

  return { success: true };
}

export { readSaaFine, appendSaaFine, updateSaaFine, deleteSaaFine };