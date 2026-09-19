import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx_UXthpW40MZm6Cq-dzbHr99x-XZDMxJWEcc0HGlBXP4xCFQhfrws62PKBP0-oRlrL1w/exec";
const ADMIN_KEY = "rcevents";

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

async function migrateEvents() {
  console.log("Fetching events from Apps Script...");
  const response = await fetch(`${APPS_SCRIPT_URL}?action=getAllEvents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminKey: ADMIN_KEY })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch from Apps Script: ${response.statusText}`);
  }
  
  const events = await response.json();
  console.log(`Fetched ${events.length} events from Google Sheets.`);
  
  const batch = db.batch();
  const eventsCollection = db.collection('events');
  
  let count = 0;
  for (const event of events) {
    if (!event.eventId) continue;
    
    // Convert string booleans if needed
    const eventDoc = {
      ...event,
      isActive: event.isActive === true || String(event.isActive).toUpperCase() === "TRUE",
      isTeamEvent: event.isTeamEvent === true || String(event.isTeamEvent).toUpperCase() === "TRUE",
      externalAllowed: event.externalAllowed === true || String(event.externalAllowed).toUpperCase() === "TRUE",
      updatedAt: new Date().toISOString()
    };
    
    const docRef = eventsCollection.doc(event.eventId);
    batch.set(docRef, eventDoc, { merge: true });
    count++;
  }
  
  await batch.commit();
  console.log(`✅ Successfully migrated ${count} events to Firestore!`);
}

migrateEvents().catch(console.error);
