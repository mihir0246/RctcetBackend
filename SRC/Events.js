import { db } from "./firebase.js";
import fetch from "node-fetch";

const APPS_SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx_UXthpW40MZm6Cq-dzbHr99x-XZDMxJWEcc0HGlBXP4xCFQhfrws62PKBP0-oRlrL1w/exec";
const ADMIN_KEY = process.env.VITE_ADMIN_KEY || "rcevents";

// Helper for Background Dual-Sync
function syncToGoogleSheets(action, id, body = {}) {
  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, id, adminKey: ADMIN_KEY, ...body }),
  }).catch((err) => console.error(`[Dual-Sync Error] Failed to sync ${action} for ${id}:`, err.message));
}

async function getAllEvents(activeOnly = false) {
  if (!db) throw new Error("Firestore database is not initialized.");

  const snapshot = await db.collection("events").get();
  let events = [];
  const now = new Date();

  snapshot.forEach((doc) => {
    const event = doc.data();
    if (activeOnly) {
      if (!event.isActive) return;
      const eventDate = new Date(event.date);
      if (!isNaN(eventDate) && eventDate < now) return;
    }
    events.push(event);
  });

  // Sort by date (descending or ascending? typically upcoming first if active)
  return events;
}

async function getEvent(identifier) {
  if (!db) throw new Error("Firestore database is not initialized.");

  // Try direct ID lookup first
  const doc = await db.collection("events").doc(identifier).get();
  if (doc.exists) return doc.data();

  // Try eventName lookup (frontend uses /event/Event_Name)
  const decodedSearch = decodeURIComponent(identifier).replace(/_/g, " ").toLowerCase();
  const snapshot = await db.collection("events").get();

  const matchedDocs = snapshot.docs.filter(d => String(d.data().eventName).toLowerCase() === decodedSearch);
  if (matchedDocs.length === 0) throw new Error("Event not found");

  // Prefer the active event if there are duplicates with the same name
  const activeDoc = matchedDocs.find(d => d.data().isActive === true);
  const foundDoc = activeDoc || matchedDocs[0];

  if (!foundDoc) throw new Error("Event not found");

  return foundDoc.data();
}

async function toggleEvent(eventId) {
  if (!db) throw new Error("Firestore database is not initialized.");

  const docRef = db.collection("events").doc(eventId);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("Event not found");

  const currentVal = doc.data().isActive;
  const newVal = !currentVal;

  await docRef.update({
    isActive: newVal,
    updatedAt: new Date().toISOString()
  });

  // Dual-Sync to Google Sheets
  syncToGoogleSheets("toggleEvent", eventId);

  return { success: true, isActive: newVal };
}

async function deleteEvent(eventId) {
  if (!db) throw new Error("Firestore database is not initialized.");

  const docRef = db.collection("events").doc(eventId);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("Event not found");

  // We can do a soft-delete by setting isActive to false, or hard delete.
  // The original Google Sheets code just set column O to FALSE (which is soft delete)
  await docRef.update({
    isActive: false,
    deletedAt: new Date().toISOString()
  });

  // Dual-Sync to Google Sheets
  syncToGoogleSheets("deleteEvent", eventId);

  return { success: true };
}

// createEvent is implemented in google_apps_script.gs, but if the Node backend ever needs to create one:
async function createEvent(eventData) {
  if (!db) throw new Error("Firestore database is not initialized.");

  let eventId = eventData.eventId;

  if (!eventId) {
    const snapshot = await db.collection("events").get();
    let maxEvtId = 0;
    snapshot.docs.forEach(doc => {
      const id = doc.id;
      if (id.startsWith("EVT") && id.length <= 8) { // To ignore EVT1789850942240 timestamp anomalies
        const num = parseInt(id.substring(3), 10);
        if (!isNaN(num) && num > maxEvtId) {
          maxEvtId = num;
        }
      }
    });
    const nextId = maxEvtId + 1;
    eventId = `EVT${String(nextId).padStart(3, '0')}`;
  }

  const docRef = db.collection("events").doc(eventId);

  await docRef.set({
    ...eventData,
    eventId,
    createdAt: new Date().toISOString()
  });

  // Dual-Sync to Google Sheets
  syncToGoogleSheets("createEvent", eventId, eventData);

  return { success: true, eventId };
}

async function editEvent(eventId, eventData) {
  if (!db) throw new Error("Firestore database is not initialized.");

  const docRef = db.collection("events").doc(eventId);
  const doc = await docRef.get();

  if (!doc.exists) throw new Error("Event not found");

  await docRef.update({
    ...eventData,
    updatedAt: new Date().toISOString()
  });

  // Dual-Sync to Google Sheets
  syncToGoogleSheets("editEvent", eventId, eventData);

  return { success: true, eventId };
}

export { getAllEvents, getEvent, toggleEvent, deleteEvent, createEvent, editEvent };
