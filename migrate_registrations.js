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

// Membership Registrations Master Sheet
const MEMBERSHIP_SPREADSHEET_ID = "1fyH026O9dcoy8w_0NqLy4Lv9-rhoQVaidms8d10cSaE";
const SHEET_NAME = "Form Responses 1"; // Default Google Forms/Sheets tab name

async function fetchFromSheets() {
  // Select all columns since membership has ~40 fields
  const query = `select *`;
  const url = `https://docs.google.com/spreadsheets/d/${MEMBERSHIP_SPREADSHEET_ID}/gviz/tq?sheet=${SHEET_NAME}&tq=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url);
    const data = JSON.parse(response.data.substr(47).slice(0, -2));

    if (!data.table.rows.length) {
      return [];
    }

    return data.table.rows.map((row) => {
      // Helper function to safely get cell value
      const getVal = (index) => row.c[index]?.v || "";

      return {
        timestamp: getVal(0),
        email: getVal(1),
        personalEmail: getVal(2),
        gsuiteId: getVal(3),
        firstName: getVal(4),
        middleName: getVal(5),
        lastName: getVal(6),
        dob: getVal(7),
        gender: getVal(8),
        bloodGroup: getVal(9),
        phone: getVal(10),
        year: getVal(11),
        department: getVal(12),
        division: getVal(13),
        rollNumber: getVal(14),
        addressLine1: getVal(15),
        addressLine2: getVal(16),
        addressLine3: getVal(17),
        pincode: getVal(18),
        city: getVal(19),
        railwayStation: getVal(20),
        fatherName: getVal(21),
        fatherAge: getVal(22),
        fatherOccupation: getVal(23),
        motherName: getVal(24),
        motherAge: getVal(25),
        motherOccupation: getVal(26),
        motherOccupationOther: getVal(27),
        parentContact: getVal(28),
        hasSiblings: getVal(29),
        siblingCount: getVal(30),
        rotaractYear: getVal(31),
        hobbies: getVal(32),
        helpWith: getVal(33),
        playSports: getVal(34),
        sportsAchievement: getVal(35),
        culturalActivities: getVal(36),
        culturalAchievement: getVal(37),
        paymentMethod: getVal(38),
        receiptUrl: getVal(39),
        paymentStatus: getVal(40),
      };
    });
  } catch (error) {
    console.error(`Error reading Google Sheets data (Sheet: ${SHEET_NAME}):`, error.message);
    return [];
  }
}

async function migrateMembershipRegistrations() {
  console.log(`Fetching Membership Registrations from Google Sheets...`);
  const registrations = await fetchFromSheets();

  if (registrations.length === 0) {
    console.log("No registrations found to migrate.");
    return;
  }

  console.log(`Fetched ${registrations.length} Registration rows.`);

  const batch = db.batch();
  const membersCollection = db.collection('membersWebRegi');

  let count = 0;
  for (const reg of registrations) {
    if (!reg.email && !reg.firstName) continue; // Skip totally empty rows

    const docRef = membersCollection.doc(); // Auto-generate ID
    batch.set(docRef, {
      ...reg,
      migrated: true
    });
    count++;
  }

  await batch.commit();
  console.log(`✅ Successfully migrated ${count} Membership Registrations to the 'members' collection in Firestore!`);
}

migrateMembershipRegistrations().catch(console.error);
