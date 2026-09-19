// ContactUs with Firestore (Google Sheets Sync Disabled until Apps Script upgrade)
import { db } from "./firebase.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;

// ---------- READ ----------
async function readContactUs() {
  if (db) {
    try {
      const snapshot = await db.collection("contacts").orderBy("createdAt", "desc").get();
      if (!snapshot.empty) {
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) {
      console.warn("Firestore contact read warning, falling back to Google Sheets:", err.message);
    }
  }

  // Fallback to public Visualization API
  const query = `select A,B,C,D,E,F`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=ContactUs&tq=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url);
    const data = JSON.parse(response.data.substr(47).slice(0, -2));

    if (!data.table.rows.length) {
      return [];
    }

    const rows = data.table.rows.map((row) => ({
      id: row.c[0]?.v || "",
      firstname: row.c[1]?.v || "",
      lastname: row.c[2]?.v || "",
      mail: row.c[3]?.v || "",
      phno: row.c[4]?.v || "",
      message: row.c[5]?.v || "",
    }));

    return rows;
  } catch (error) {
    console.error("Error reading contact data:", error.message);
    return [];
  }
}

// ---------- APPEND ----------
async function appendDataContactUs(newRow) {
  const [id, firstname, lastname, mail, phno, message] = newRow;

  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("contacts").doc(String(id)).set({
    id: String(id),
    firstname,
    lastname,
    mail,
    phno,
    message,
    createdAt: new Date().toISOString(),
  });
  console.log(`Firestore backup saved for contact ID ${id}`);

  // Dual-Sync to Google Sheets disabled as servicekey.json is removed in Phase 4
  return { updatedCells: 6 };
}

export { readContactUs, appendDataContactUs };