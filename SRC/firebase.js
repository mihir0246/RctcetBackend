import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

let db = null;
let auth = null;

try {
  if (!admin.apps.length) {
    const serviceAccountPath = path.resolve(__dirname, "../firebase-service-account.json");
    
    if (fs.existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin initialized using firebase-service-account.json");
    } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
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
      console.log("Firebase Admin initialized using environment variables.");
    } else {
      console.warn("⚠️ WARNING: Firebase Admin credentials missing. Please provide firebase-service-account.json or set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env");
    }
  }

  if (admin.apps.length) {
    db = admin.firestore();
    auth = admin.auth();
  }
} catch (error) {
  console.error("Error initializing Firebase Admin SDK:", error);
}

export { db, auth, admin };
