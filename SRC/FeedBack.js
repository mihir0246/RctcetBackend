// FeedBack.js with Firestore (Google Sheets Sync Disabled until Apps Script upgrade)
import { db } from "./firebase.js";
import dotenv from "dotenv";

dotenv.config();

const spreadsheetId = process.env.SPREADSHEET_ID;

async function appendFeedBack({ name, mail, event, feedback, clubname }) {
  const timestamp = new Date().toISOString();

  if (!db) throw new Error("Firestore database is not initialized.");

  await db.collection("feedback").add({
    name,
    mail: mail || "",
    event,
    feedback,
    clubname,
    createdAt: timestamp,
  });
  console.log(`Firestore feedback backup saved for event ${event}`);

  // Dual-Sync to Google Sheets disabled as servicekey.json is removed in Phase 4
  return { updatedCells: 6 };
}

export { appendFeedBack };