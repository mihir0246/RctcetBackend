import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });
let privateKey = process.env.FIREBASE_PRIVATE_KEY;
if (privateKey && privateKey.startsWith('"')) privateKey = privateKey.slice(1, -1);
if (privateKey) privateKey = privateKey.replace(/\\n/g, '\n');
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: privateKey,
  })
});
const db = getFirestore(app);

async function run() {
  const membersSnap = await db.collection('members').count().get();
  const ambSnap = await db.collection('ambassadorials').count().get();
  const nonRotSnap = await db.collection('nonRotaractors').count().get();

  console.log(`Total Home Members: ${membersSnap.data().count}`);
  console.log(`Total Ambassadorials: ${ambSnap.data().count}`);
  console.log(`Total Non-Rotaractors: ${nonRotSnap.data().count}`);
  console.log(`Total Overrall: ${membersSnap.data().count + ambSnap.data().count + nonRotSnap.data().count}`);
}
run().catch(console.error);
