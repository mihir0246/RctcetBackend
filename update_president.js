import { db } from "./SRC/firebase.js";

async function run() {
  if (!db) {
    console.error("Firestore DB not initialized!");
    process.exit(1);
  }
  
  try {
    const targetEmail = "rc4@test.com";
    console.log(`Searching for user with email: ${targetEmail}`);
    
    const usersRef = db.collection("users");
    const snapshot = await usersRef.where("email", "==", targetEmail).get();
    
    if (snapshot.empty) {
      console.log("No matching documents.");
      process.exit(0);
    }  

    for (const doc of snapshot.docs) {
      await usersRef.doc(doc.id).update({
        position: "PRESIDENT"
      });
      console.log(`Successfully updated user ${doc.id} (${targetEmail}) to PRESIDENT.`);
    }

  } catch (error) {
    console.error(error);
  }
  process.exit(0);
}

run();
