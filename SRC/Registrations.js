import { db } from "./firebase.js";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const APPS_SCRIPT_URL = process.env.VITE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbx_UXthpW40MZm6Cq-dzbHr99x-XZDMxJWEcc0HGlBXP4xCFQhfrws62PKBP0-oRlrL1w/exec";

// 1. Submit Registration
export async function submitRegistration(eventId, registrationData) {
  if (!db) throw new Error("Firestore database is not initialized.");

  // Fetch event to check limits
  const eventDoc = await db.collection("events").doc(eventId).get();
  if (!eventDoc.exists) throw new Error("Event not found");
  const event = eventDoc.data();
  const registrationLimit = event.registrationLimit ? parseInt(event.registrationLimit) : null;

  // Check current registration count
  const regSnapshot = await db.collection("registrations").where("eventId", "==", String(eventId)).get();
  const currentCount = regSnapshot.size;

  if (registrationLimit && currentCount >= registrationLimit) {
    return { success: false, reason: "FORM_FULL", registrationCount: currentCount };
  }

  // Save to Firestore
  const registrationRef = db.collection("registrations").doc();
  const entry = {
    ...registrationData,
    eventId: String(eventId),
    createdAt: new Date().toISOString()
  };
  await registrationRef.set(entry);
  
  // Dual-sync to Google Sheets in background
  fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "submit", id: eventId, ...registrationData })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) console.error(`[Dual-Sync Error] Registration sync failed for event ${eventId}:`, data.error);
  })
  .catch(err => console.error(`[Dual-Sync Error] Failed to sync registration for event ${eventId}:`, err.message));

  return { 
    success: true, 
    message: "Registration submitted successfully", 
    registrationId: registrationRef.id,
    registrationCount: currentCount + 1,
    limit: registrationLimit || null
  };
}

// 2. Get Event Counts
export async function getEventCounts() {
  if (!db) throw new Error("Firestore database is not initialized.");

  // To make counting extremely fast for the Admin Dashboard, we pull all registrations
  // and group them in memory. This bypasses the Google Sheets bottleneck entirely.
  const snapshot = await db.collection("registrations").get();
  const counts = {};
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.eventId) {
      counts[data.eventId] = (counts[data.eventId] || 0) + 1;
    }
  });

  return counts;
}
