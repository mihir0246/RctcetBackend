import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
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

const OLD_MEMBERS_SPREADSHEET_ID = '1SuwWpn2sUDohCIpnHLKYgWHxbhyo2cexnMJj0r2f0uE';
const TABS_TO_MIGRATE = [
  { name: 'Members', collection: 'members' },
  { name: 'Ambassadorials', collection: 'ambassadorials' },
  { name: 'Non Rotarators', collection: 'nonRotaractors' }
];

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
  let newlyAdded = [];
  
  for (const tab of TABS_TO_MIGRATE) {
    const snap = await db.collection(tab.collection).get();
    const existingNames = new Set(snap.docs.map(d => {
       const dd = d.data();
       const first = dd['First Name'] || dd['Name'] || dd.name || '';
       const last = dd['Last Name'] || '';
       return `${first} ${last}`.trim().toLowerCase();
    }));

    const records = await fetchFromSheet(tab.name);
    let count = 0;
    
    const batch = db.batch();
    for (const record of records) {
      const email = record['Email'] || record['email'] || '';
      let name = record['First Name'] || record['Name'] || record.name || '';
      const lastName = record['Last Name'] || '';
      
      let fullName = name;
      if (tab.name === 'Members' && lastName) {
         fullName = `${name} ${lastName}`.trim();
      }

      if (!email && !fullName) continue;

      if (!existingNames.has(fullName.toLowerCase().trim())) {
        const docRef = db.collection(tab.collection).doc();
        batch.set(docRef, { ...record, migrated: true, migratedAt: new Date().toISOString() });
        newlyAdded.push({ name: fullName, tab: tab.name });
        existingNames.add(fullName.toLowerCase().trim());
        count++;
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  }
  
  console.log(JSON.stringify(newlyAdded, null, 2));
}

run().catch(console.error);
