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

const mobileMap = {
  "prince singh": "9987887485",
  "shraddha sonkar": "9324587835",
  "mahimna sharma": "8080553939",
  "siddharth bajpai": "9920623012",
  "dhairya doshi": "9082661455",
  "parth nalavde": "9321735656",
  "tiya agarwal": "7777018975",
  // Aniket didnt give phone number
};

const rollMap = {
  "raj sharma": 3,
  "aayush baghel": 4,
  "om jadhav": 4,
  "gaurav jaju": 7,
  "aaryan dubey": 9,
  "vidhi agrawal": 1,
  "parth bhatkar": 8,
  "vatsa shetty": 8,
  "arya adhikari": 2,
  "saurav gadekar": 7,
  "shivam pal": 1,
  "shashwat pandey": 9,
  "aman kumar": 3,
  "aejaz mulla": 1,
  "amit b bhagat": 8,
  "ishita patel": 7,
  "fatima wani": 54,
  "harshita .": 5,
  "subhankar panda": 3,
  "riyan shaikh": 37,
  "sanskar chitlange": 4,
  "suhani darokar": 9,
  "dhruv singh": 42,
  "khushi kumari": 9,
  "yash badi": 7,
  "tiya agarwal": 1
};

async function run() {
  const snap = await db.collection('members').get();
  
  const batch = db.batch();
  let updateCount = 0;
  
  snap.docs.forEach(d => {
      const data = d.data();
      const first = data['First Name'] || data['Name'] || '';
      const last = data['Last Name'] || '';
      const fullName = `${first} ${last}`.trim().replace(/\s+/g, ' ').toLowerCase();
      
      let updates = {};
      
      // Match mobile map
      for (const [key, num] of Object.entries(mobileMap)) {
          if (fullName.includes(key)) {
              updates['Mobile'] = num;
          }
      }
      
      // Match roll map
      for (const [key, roll] of Object.entries(rollMap)) {
          if (fullName.includes(key)) {
              updates['Roll Number'] = roll;
          }
      }
      
      if (Object.keys(updates).length > 0) {
          batch.update(d.ref, updates);
          updateCount++;
          console.log(`Will update ${fullName} with:`, updates);
      }
  });

  if (updateCount > 0) {
      await batch.commit();
      console.log(`Successfully updated ${updateCount} records in Firestore!`);
  } else {
      console.log("No records matched for update.");
  }
}

run().catch(console.error);
