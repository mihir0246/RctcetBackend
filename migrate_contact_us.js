import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Initialize Firebase Admin
let db;
try {
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    })
  });
  db = getFirestore();
  console.log("✅ Firebase initialized successfully");
} catch (err) {
  console.error("❌ Firebase initialization failed:", err.message);
  process.exit(1);
}

const spreadsheetId = process.env.SPREADSHEET_ID;

async function fetchFromSheets() {
  const query = `select A,B,C,D,E,F`;
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?sheet=ContactUs&tq=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url);
    const data = JSON.parse(response.data.substr(47).slice(0, -2));

    if (!data.table.rows.length) {
      return [];
    }

    return data.table.rows.map((row) => ({
      id: row.c[0]?.v || "",
      firstname: row.c[1]?.v || "",
      lastname: row.c[2]?.v || "",
      mail: row.c[3]?.v || "",
      phno: row.c[4]?.v || "",
      message: row.c[5]?.v || "",
    }));
  } catch (error) {
    console.error("Error reading Google Sheets data:", error.message);
    return [];
  }
}

async function migrateContactUs() {
  console.log("Fetching Contact Us data from Google Sheets...");
  const contacts = await fetchFromSheets();

  if (contacts.length === 0) {
    console.log("No contacts found to migrate.");
    return;
  }

  console.log(`Fetched ${contacts.length} Contact Us rows.`);

  const batch = db.batch();
  const contactsCollection = db.collection('contacts');

  let count = 0;
  for (const contact of contacts) {
    if (!contact.id && !contact.mail) continue; // Skip totally empty rows

    // Ensure we have a valid string ID
    const contactId = String(contact.id || Math.floor(Math.random() * 1000000));

    const contactDoc = {
      ...contact,
      id: contactId,
      createdAt: new Date().toISOString()
    };

    const docRef = contactsCollection.doc(contactId);
    batch.set(docRef, contactDoc, { merge: true });
    count++;
  }

  await batch.commit();
  console.log(`✅ Successfully migrated ${count} Contact Us submissions to Firestore!`);
}

migrateContactUs().catch(console.error);
