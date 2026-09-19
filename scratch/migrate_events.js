import { db } from "../SRC/firebase.js";
import fetch from "node-fetch";

const APPS_SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL;
const ADMIN_KEY = process.env.VITE_ADMIN_KEY;

async function migrateMissingEvents() {
  console.log("Fetching all events from Google Sheets...");
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "getAllEvents", adminKey: ADMIN_KEY }),
  });

  const sheetEvents = await response.json();
  if (sheetEvents.error) throw new Error(sheetEvents.error);
  console.log(`Found ${sheetEvents.length} events in Google Sheets.`);

  console.log("Fetching all events from Firestore...");
  const firestoreSnapshot = await db.collection("events").get();
  const firestoreEvents = [];
  firestoreSnapshot.forEach(doc => firestoreEvents.push(doc.data()));
  console.log(`Found ${firestoreEvents.length} events in Firestore.`);

  const firestoreEventIds = new Set(firestoreEvents.map(e => String(e.eventId).trim()));

  const missingEvents = sheetEvents.filter(e => {
    // If the event lacks an ID in Sheets, we can't migrate it easily this way, 
    // but Sheets events should have IDs.
    return e.eventId && !firestoreEventIds.has(String(e.eventId).trim());
  });

  console.log(`Found ${missingEvents.length} missing events to migrate!`);

  if (missingEvents.length === 0) {
    console.log("No missing events. Exiting.");
    process.exit(0);
  }

  console.log("Migrating events to Firestore...");
  let count = 0;
  for (const event of missingEvents) {
    const eventId = String(event.eventId).trim();
    // Reconstruct data, parsing JSON strings from Sheets (like customFields, ticketTypes, speakers)
    const cleanEvent = { ...event };
    
    try { if (typeof cleanEvent.customFields === 'string') cleanEvent.customFields = JSON.parse(cleanEvent.customFields); } catch(e){}
    try { if (typeof cleanEvent.ticketTypes === 'string') cleanEvent.ticketTypes = JSON.parse(cleanEvent.ticketTypes); } catch(e){}
    try { if (typeof cleanEvent.speakers === 'string') cleanEvent.speakers = JSON.parse(cleanEvent.speakers); } catch(e){}

    await db.collection("events").doc(eventId).set(cleanEvent, { merge: true });
    console.log(`- Migrated ${eventId} (${cleanEvent.name})`);
    count++;
  }

  console.log(`\nSuccessfully migrated ${count} events to Firestore!`);
  process.exit(0);
}

migrateMissingEvents().catch(err => {
  console.error("Migration Failed:", err);
  process.exit(1);
});
