// SaaFine.js with Google Sheets + Firestore Dual-Sync Backup
import { authenticateSheets } from "./auth.js";
import { db } from "./firebase.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = "SaaFine!A:G"; // 7 columns

// ---------- READ ----------
async function readSaaFine() {
  if (db) {
    try {
      const snapshot = await db.collection("saafine").get();
      if (!snapshot.empty) {
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    } catch (err) {
      console.warn("Firestore SaaFine read warning, falling back to Google Sheets:", err.message);
    }
  }

  const query = `select A,B,C,D,E,F,G`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=SaaFine&tq=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url);
    const data = JSON.parse(response.data.substr(47).slice(0, -2));

    if (!data.table.rows.length) {
      return [];
    }

    const rows = data.table.rows.map((row) => ({
      id: row.c[0]?.v || "",
      name: row.c[1]?.v || "",
      date: row.c[2]?.v || "",
      amount: row.c[3]?.v || "",
      reason: row.c[4]?.v || "",
      mail: row.c[5]?.v || "",
      status: row.c[6]?.v || "",
    }));

    return rows;
  } catch (error) {
    console.error("Error reading SaaFine data:", error.message);
    return [];
  }
}

// ---------- APPEND (DUAL-SYNC) ----------
async function appendSaaFine(newRow) {
  const [id, name, date, amount, reason, mail, status] = newRow;

  // 1. Firestore Backup
  if (db) {
    try {
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
    } catch (err) {
      console.error("Firestore backup error for SaaFine:", err.message);
    }
  }

  // 2. Google Sheets Write
  try {
    const sheets = await authenticateSheets();
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [newRow],
      },
    });

    return response.data.updates;
  } catch (error) {
    console.error("Error appending SaaFine data to Google Sheets:", error.message);
    return null;
  }
}

// ---------- UPDATE (DUAL-SYNC) ----------
async function updateSaaFine(id, updatedValues) {
  const [idVal, name, date, amount, reason, mail, status] = updatedValues;

  // 1. Firestore Update
  if (db) {
    try {
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
    } catch (err) {
      console.error("Firestore SaaFine update error:", err.message);
    }
  }

  // 2. Google Sheets Update
  try {
    const sheets = await authenticateSheets();
    const allRows = await readSaaFine();
    const rowIndex = allRows.findIndex((row) => row.id == id);

    if (rowIndex === -1) {
      return null;
    }

    const range = `SaaFine!A${rowIndex + 2}:G${rowIndex + 2}`;
    const result = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      resource: { values: [updatedValues] },
    });

    return result.data;
  } catch (error) {
    console.error("Error updating SaaFine data in Google Sheets:", error.message);
    return null;
  }
}

// ---------- DELETE (DUAL-SYNC) ----------
async function deleteSaaFine(id) {
  // 1. Firestore Delete
  if (db) {
    try {
      await db.collection("saafine").doc(String(id)).delete();
    } catch (err) {
      console.error("Firestore SaaFine delete error:", err.message);
    }
  }

  // 2. Google Sheets Delete
  try {
    const sheets = await authenticateSheets();
    const allRows = await readSaaFine();
    const rowIndex = allRows.findIndex((row) => row.id == id);

    if (rowIndex === -1) {
      return null;
    }

    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetId = metadata.data.sheets.find((s) => s.properties.title === "SaaFine").properties.sheetId;

    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2,
              },
            },
          },
        ],
      },
    });

    return response.data;
  } catch (error) {
    console.error("Error deleting SaaFine row in Google Sheets:", error.message);
    return null;
  }
}

export { readSaaFine, appendSaaFine, updateSaaFine, deleteSaaFine };