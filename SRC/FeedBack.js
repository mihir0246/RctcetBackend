// FeedBack.js with Google Sheets + Firestore Dual-Sync Backup
import { authenticateSheets } from "./auth.js";
import { db } from "./firebase.js";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;
const sheetName = "FeedBack!A:F";

async function appendFeedBack({ name, mail, event, feedback, clubname }) {
  const timestamp = new Date().toISOString();

  // 1. Dual-Sync Backup to Firestore
  if (db) {
    try {
      await db.collection("feedback").add({
        name,
        mail: mail || "",
        event,
        feedback,
        clubname,
        createdAt: timestamp,
      });
      console.log(`Firestore feedback backup saved for event ${event}`);
    } catch (err) {
      console.error("Firestore backup error for FeedBack:", err.message);
    }
  }

  // 2. Primary Write to Google Sheets
  try {
    const sheets = await authenticateSheets();
    const datetime = new Date().toLocaleDateString();

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: {
        values: [[datetime, name, mail || "", event, feedback, clubname]],
      },
    });

    return response.data.updates;
  } catch (error) {
    console.error("Error appending FeedBack data to Google Sheets:", error.message);
    return null;
  }
}

export { appendFeedBack };