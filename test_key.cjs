const dotenv = require("dotenv");
const admin = require("firebase-admin");

dotenv.config();

let rawKey = process.env.FIREBASE_PRIVATE_KEY;
if (!rawKey) {
  console.log("FIREBASE_PRIVATE_KEY is missing from .env");
  process.exit(1);
}

if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
  rawKey = rawKey.slice(1, -1);
} else if (rawKey.startsWith("'") && rawKey.endsWith("'")) {
  rawKey = rawKey.slice(1, -1);
}

try {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: rawKey.replace(/\\n/g, "\n"),
    }),
  });
  console.log("SUCCESS! Firebase admin apps:", admin.apps.length);
} catch (error) {
  console.error("FAILED to init admin SDK:", error.message);
}
