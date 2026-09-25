import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize Firebase Admin
let db;
let auth;
try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
  db = getFirestore(app);
  auth = getAuth(app);
  console.log("✅ Firebase initialized successfully");
} catch (err) {
  console.error("❌ Firebase initialization failed:", err.message);
  process.exit(1);
}

// Master Sheet ID for old members
const OLD_MEMBERS_SPREADSHEET_ID = "1SuwWpn2sUDohCIpnHLKYgWHxbhyo2cexnMJj0r2f0uE";

const TABS_TO_MIGRATE = [
  { name: "Members", collection: "members" },
  { name: "Ambassadorials", collection: "ambassadorials" },
  { name: "Non Rotarators", collection: "nonRotaractors" } // (Yes, keeping the typo from the sheet!)
];

async function fetchFromSheet(sheetName) {
  const query = `select *`;
  const url = `https://docs.google.com/spreadsheets/d/${OLD_MEMBERS_SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tq=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url);
    const data = JSON.parse(response.data.substr(47).slice(0, -2));

    if (!data.table.rows.length) {
      return [];
    }

    const headers = data.table.cols.map(c => c.label);

    return data.table.rows.map((row) => {
      const record = {};
      headers.forEach((header, index) => {
        if (header) {
          record[header.trim()] = row.c[index]?.v || "";
        }
      });
      return record;
    });
  } catch (error) {
    console.error(`Error reading Google Sheets data (Sheet: ${sheetName}):`, error.message);
    return [];
  }
}

async function migrateOldMembers() {
  console.log(`Starting migration from Master Sheet...`);
  const batch = db.batch();
  let totalSuccess = 0;

  for (const tab of TABS_TO_MIGRATE) {
    console.log(`Fetching ${tab.name}...`);
    const records = await fetchFromSheet(tab.name);

    if (records.length === 0) {
      console.log(`No records found in ${tab.name}.`);
      continue;
    }

    const targetCollection = db.collection(tab.collection);

    let count = 0;
    for (const record of records) {
      const email = record["Email"] || record["email"] || "";
      const name = record["First Name"] || record["Name"] || "";

      if (!email && !name) continue; // Skip totally empty rows

      const docRef = targetCollection.doc();
      batch.set(docRef, {
        ...record,
        migrated: true,
        migratedAt: new Date().toISOString()
      });

      count++;
      totalSuccess++;
    }
    console.log(`Prepared ${count} records from ${tab.name} -> '${tab.collection}' collection.`);
  }

  if (totalSuccess > 0) {
    console.log("Committing Firestore batch...");
    await batch.commit();
    console.log(`✅ Successfully migrated ${totalSuccess} total records into their respective collections!`);
  } else {
    console.log("⚠️ No valid records found across all sheets.");
  }
}

migrateOldMembers().catch(console.error);
