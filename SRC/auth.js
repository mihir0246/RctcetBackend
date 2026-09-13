import "dotenv/config";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KEY_FILE_PATH = path.join(__dirname, "../servicekey.json");
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

async function authenticateSheets() {
  if (!fs.existsSync(KEY_FILE_PATH)) {
    console.warn("⚠️ Google Sheets servicekey.json not found in RctcetBackend root directory.");
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: KEY_FILE_PATH,
      scopes: SCOPES,
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    return sheets;
  } catch (error) {
    console.error("Error during Google Sheets API setup:", error.message);
    return null;
  }
}

export { authenticateSheets };