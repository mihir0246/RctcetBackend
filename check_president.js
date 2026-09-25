import { db } from "./SRC/firebase.js";

async function run() {
  if (!db) {
    console.error("Firestore DB not initialized!");
    process.exit(1);
  }
  
  try {
    console.log("Fetching all users from users collection...");
    const usersSnap = await db.collection("users").get();
    usersSnap.forEach(doc => {
      const data = doc.data();
      console.log(`User: ${data.email} -> Position: ${data.position}, Roles: ${JSON.stringify(data.roles)}`);
    });
  } catch (error) {
    console.error(error);
  }
  process.exit(0);
}

run();
