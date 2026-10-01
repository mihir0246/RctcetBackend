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
  const snap = await db.collection('members').get();
  
  let missingMobile = [];
  let missingRoll = [];
  
  snap.docs.forEach(d => {
      const data = d.data();
      
      const mobile = data['Mobile'];
      const roll = data['Roll Number'];
      
      const first = data['First Name'] || data['Name'] || '';
      const last = data['Last Name'] || '';
      const fullName = `${first} ${last}`.trim().replace(/\s+/g, ' ');
      
      if (mobile === undefined || mobile === null || mobile === "") {
          missingMobile.push(fullName);
      }
      if (roll === undefined || roll === null || roll === "") {
          missingRoll.push(fullName);
      }
  });

  console.log(`--- MISSING MOBILE NUMBERS (${missingMobile.length}) ---`);
  missingMobile.forEach(n => console.log(`- ${n}`));

  console.log(`\n--- MISSING ROLL NUMBERS (${missingRoll.length}) ---`);
  missingRoll.forEach(n => console.log(`- ${n}`));
}

run().catch(console.error);
