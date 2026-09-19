import { auth, db } from "./firebase.js";

/**
 * Fetches all registered users from Firebase Auth and merges their role data from Firestore.
 */
export const getAllUsers = async () => {
  if (!auth || !db) throw new Error("Firebase not initialized");

  try {
    const listUsersResult = await auth.listUsers(1000);
    const authUsers = listUsersResult.users.map((userRecord) => ({
      uid: userRecord.uid,
      email: userRecord.email,
      name: userRecord.displayName || userRecord.email.split("@")[0],
      createdAt: userRecord.metadata.creationTime,
      lastSignInTime: userRecord.metadata.lastSignInTime,
    }));

    // Fetch all roles from Firestore
    const usersSnapshot = await db.collection("users").get();
    const rolesMap = {};
    usersSnapshot.forEach((doc) => {
      rolesMap[doc.id] = doc.data();
    });

    // Merge
    const mergedUsers = authUsers.map((user) => ({
      ...user,
      position: rolesMap[user.uid]?.position || "GBM",
      roles: rolesMap[user.uid]?.roles || ["MEMBER"],
      assignedAvenues: rolesMap[user.uid]?.assignedAvenues || [],
    }));

    // Sort by name
    return mergedUsers.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("Error fetching all users:", error);
    throw new Error("Failed to fetch users");
  }
};

/**
 * Assigns a position to a user in the Firestore database.
 * @param {string} targetUid - The UID of the user receiving the new role.
 * @param {string} newPosition - The new position (e.g., 'SAA', 'SECRETARY').
 * @param {Array<string>} roles - Accompanying system roles (e.g., ['SAA']).
 */
export const assignPosition = async (targetUid, newPosition, roles = []) => {
  if (!db) throw new Error("Firebase database not initialized");

  try {
    const userRef = db.collection("users").doc(targetUid);
    
    await userRef.set(
      {
        position: newPosition,
        roles: roles,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { status: "success", message: `Successfully assigned ${newPosition}` };
  } catch (error) {
    console.error("Error assigning position:", error);
    throw new Error("Failed to assign position");
  }
};
