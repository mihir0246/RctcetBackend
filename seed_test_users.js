import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, ".env") });

let rawKey = process.env.FIREBASE_PRIVATE_KEY;
if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
  rawKey = rawKey.slice(1, -1);
} else if (rawKey.startsWith("'") && rawKey.endsWith("'")) {
  rawKey = rawKey.slice(1, -1);
}

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: rawKey.replace(/\\n/g, "\n"),
  }),
});

const db = admin.firestore();
const auth = admin.auth();

const usersToCreate = [
  { email: "rc1@test.com", password: "password123", displayName: "Test Secretary", position: "SECRETARY", roles: [] },
  { email: "rc2@test.com", password: "password123", displayName: "Test SAA", position: "SAA", roles: ["SAA"] },
  { email: "rc3@test.com", password: "password123", displayName: "Test Finance", position: "FINANCE", roles: ["FINANCE"] },
  { email: "rc4@test.com", password: "password123", displayName: "Test GBM", position: "GBM", roles: [] },
  { email: "rc5@test.com", password: "password123", displayName: "Test VP", position: "VICE_PRESIDENT", roles: [] },
];

async function seedUsers() {
  console.log("Starting user seeding process...");
  for (const u of usersToCreate) {
    try {
      // Create auth user
      const userRecord = await auth.createUser({
        email: u.email,
        password: u.password,
        displayName: u.displayName,
      });
      console.log(`Created Auth user: ${userRecord.email}`);

      // Create firestore document
      await db.collection("users").doc(userRecord.uid).set({
        email: u.email,
        name: u.displayName,
        position: u.position,
        roles: u.roles,
        assignedAvenues: [],
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Assigned role ${u.position} to ${u.email} in Firestore`);
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        console.log(`User ${u.email} already exists. Skipping...`);
      } else {
        console.error(`Error creating user ${u.email}:`, error);
      }
    }
  }
  console.log("Seeding complete!");
  process.exit(0);
}

seedUsers();
