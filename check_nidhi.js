import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

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

const OLD_MEMBERS_SPREADSHEET_ID = '1SuwWpn2sUDohCIpnHLKYgWHxbhyo2cexnMJj0r2f0uE';

async function fetchFromSheet(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${OLD_MEMBERS_SPREADSHEET_ID}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tq=select%20*`;
  const response = await axios.get(url);
  const data = JSON.parse(response.data.substr(47).slice(0, -2));
  if (!data.table.rows.length) return [];
  const headers = data.table.cols.map(c => c.label);
  return data.table.rows.map((row) => {
    const record = {};
    headers.forEach((h, i) => { if (h) record[h.trim()] = row.c[i]?.v || ''; });
    return record;
  });
}


async function run() {
  const snap = await db.collection('members').get();
  const firestoreNames = snap.docs.filter(d => {
     const data = d.data();
     const first = data['First Name'] || data['Name'] || data.name || '';
     const last = data['Last Name'] || '';
     const full = `${first} ${last}`.trim().toLowerCase();
     return full.includes('nidhi');
  }).map(d => d.data());
  console.log("IN FIRESTORE: ", JSON.stringify(firestoreNames, null, 2));

  const sheetMembers = await fetchFromSheet('Members');
  const sheetNidhi = sheetMembers.filter(r => {
     const first = r['First Name'] || r['Name'] || r.name || '';
     const last = r['Last Name'] || '';
     const full = `${first} ${last}`.trim().toLowerCase();
     return full.includes('nidhi');
  });
  console.log("IN SHEET: ", JSON.stringify(sheetNidhi, null, 2));
}
run().catch(console.error);
