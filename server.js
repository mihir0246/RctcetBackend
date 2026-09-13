import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { verifyAuth, requireAuth, requirePermission } from "./SRC/authMiddleware.js";
import { db, auth as firebaseAuth } from "./SRC/firebase.js";

// Database Service Modules with Dual-Sync
import { readSaaFine, appendSaaFine, updateSaaFine, deleteSaaFine } from "./SRC/SaaFine.js";
import { readContactUs, appendDataContactUs } from "./SRC/ContactUs.js";
import { readEventsDrive } from "./SRC/EventsDrive.js";
import { appendFeedBack } from "./SRC/FeedBack.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Global Authentication Middleware (Attaches req.user if Bearer token present)
app.use(verifyAuth);

// Base Health Endpoint
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "RCTCET Backend API",
    rbac: "Strict Privilege Boundaries Enforced",
    dualSyncBackup: db ? "Firestore Active" : "Google Sheets Standalone",
  });
});

/* -------------------------------------------------------------------------- */
/*                     AUTHENTICATION & RBAC USER MANAGEMENT                  */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/auth/me
 * Returns profile, position, and assigned avenues for the logged-in user (including GBMs)
 */
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: req.user,
  });
});

/**
 * POST /api/admin/assign-position
 * Master Admin route (Strictly PRESIDENT only) to set position & rotate assigned avenues
 */
app.post(
  "/api/admin/assign-position",
  requirePermission({ isMasterAdminOnly: true }),
  async (req, res) => {
    const { targetUid, targetEmail, position, termYear, assignedAvenues } = req.body;

    if (!targetUid && !targetEmail) {
      return res.status(400).json({ error: "targetUid or targetEmail is required." });
    }

    try {
      let uid = targetUid;

      if (!uid && targetEmail && firebaseAuth) {
        const userRecord = await firebaseAuth.getUserByEmail(targetEmail);
        uid = userRecord.uid;
      }

      if (!uid || !db) {
        return res.status(400).json({ error: "Unable to locate user or Firestore unavailable." });
      }

      const updateData = {
        position: position || "GBM",
        termYear: termYear || "2025-2026",
        assignedAvenues: Array.isArray(assignedAvenues) ? assignedAvenues : [],
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.email,
      };

      await db.collection("users").doc(uid).set(updateData, { merge: true });

      res.json({
        message: `Successfully assigned position '${position}' and avenues to user ${targetEmail || uid}`,
        user: updateData,
      });
    } catch (err) {
      console.error("Error setting user position:", err);
      res.status(500).json({ error: "Failed to update user position and avenues." });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                       SAA FINE LEDGER (STRICTLY SAA & PRESIDENT ONLY)      */
/* -------------------------------------------------------------------------- */

// READ SaaFine Ledger (Strictly SAA & PRESIDENT only; NO CPF, NO OTHERS)
app.get(
  "/getSaaFine",
  requirePermission({ isSaaOnly: true }),
  async (req, res) => {
    try {
      const data = await readSaaFine();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch SaaFine data." });
    }
  }
);

// ADD SaaFine (Strictly SAA & PRESIDENT only)
app.post(
  "/addSaaFine",
  requirePermission({ isSaaOnly: true }),
  async (req, res) => {
    try {
      const { id, name, date, amount, reason, mail, status } = req.body;
      const fineId = id || Math.floor(Math.random() * 100000);
      const result = await appendSaaFine([
        fineId,
        name,
        date || new Date().toISOString().split("T")[0],
        amount,
        reason,
        mail,
        status || "UNPAID",
      ]);

      res.json({ message: "SaaFine added successfully (Dual-Synced)", result });
    } catch (err) {
      res.status(500).json({ error: "Failed to append SaaFine data." });
    }
  }
);

// UPDATE SaaFine Status (Strictly SAA & PRESIDENT only)
app.put(
  "/updateSaaFine/:id",
  requirePermission({ isSaaOnly: true }),
  async (req, res) => {
    try {
      const id = req.params.id;
      const { name, date, amount, reason, mail, status } = req.body;
      const result = await updateSaaFine(id, [
        id,
        name,
        date,
        amount,
        reason,
        mail,
        status,
      ]);

      if (!result) return res.status(404).json({ error: "SaaFine ID not found." });
      res.json({ message: "SaaFine updated successfully", result });
    } catch (err) {
      res.status(500).json({ error: "Failed to update SaaFine data." });
    }
  }
);

// DELETE SaaFine Record (Strictly SAA & PRESIDENT only)
app.delete(
  "/deleteSaaFine/:id",
  requirePermission({ isSaaOnly: true }),
  async (req, res) => {
    try {
      const id = req.params.id;
      const result = await deleteSaaFine(id);
      if (!result) return res.status(404).json({ error: "SaaFine ID not found." });
      res.json({ message: "SaaFine record deleted", result });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete SaaFine row." });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                     FINANCE LEDGER (STRICTLY CPF & PRESIDENT ONLY)         */
/* -------------------------------------------------------------------------- */

// READ Finance Ledger (Strictly CPF & PRESIDENT only; NO SAA, NO OTHERS)
app.get(
  "/getFinanceLedger",
  requirePermission({ isFinanceOnly: true }),
  async (req, res) => {
    try {
      if (!db) return res.status(500).json({ error: "Firestore backup unavailable." });
      const snapshot = await db.collection("finance").orderBy("createdAt", "desc").get();
      const records = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch Finance ledger data." });
    }
  }
);

// ADD Finance Entry (Strictly CPF & PRESIDENT only)
app.post(
  "/addFinanceEntry",
  requirePermission({ isFinanceOnly: true }),
  async (req, res) => {
    try {
      const { title, type, amount, avenue, description } = req.body;
      if (!title || !amount) {
        return res.status(400).json({ error: "Title and amount are required." });
      }

      if (!db) return res.status(500).json({ error: "Firestore backup unavailable." });

      const entry = {
        title,
        type: type || "EXPENSE", // INCOME or EXPENSE
        amount: Number(amount),
        avenue: avenue || "GENERAL",
        description: description || "",
        createdBy: req.user.email,
        createdAt: new Date().toISOString(),
      };

      const docRef = await db.collection("finance").add(entry);
      res.json({ message: "Finance entry recorded successfully", id: docRef.id, entry });
    } catch (err) {
      res.status(500).json({ error: "Failed to record finance entry." });
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                           CONTACT US ENDPOINTS                             */
/* -------------------------------------------------------------------------- */

// READ ContactUs submissions (Restricted to Executive Council & PR)
app.get(
  "/getContactUs",
  requirePermission({ allowedPositions: ["SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT", "PR_HEAD"] }),
  async (req, res) => {
    try {
      const contacts = await readContactUs();
      res.json(contacts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ContactUs data." });
    }
  }
);

// PUBLIC submit ContactUs (Dual-Synced to Sheets + Firestore)
app.post("/addContactUs", async (req, res) => {
  try {
    const { id, firstname, lastname, mail, phno, message } = req.body;
    const contactId = id || Math.floor(Math.random() * 100000);

    const result = await appendDataContactUs([
      contactId,
      firstname,
      lastname,
      mail,
      phno,
      message,
    ]);
    res.json({ message: "Contact inquiry submitted successfully", result });
  } catch (error) {
    res.status(500).json({ error: "Failed to append ContactUs data." });
  }
});

/* -------------------------------------------------------------------------- */
/*                         EVENTS DRIVE & FEEDBACK                            */
/* -------------------------------------------------------------------------- */

// READ Events Drive
app.get("/getEventsDrive", async (req, res) => {
  try {
    const events = await readEventsDrive();
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch EventsDrive data." });
  }
});

// PUBLIC submit Event Feedback (Dual-Synced)
app.post("/addFeedBack", async (req, res) => {
  try {
    const { name, mail, event, feedback, clubname } = req.body;

    if (!name || !event || !feedback || !clubname) {
      return res.status(400).json({
        error: "Missing required fields: name, event, feedback, clubname",
      });
    }

    const result = await appendFeedBack({ name, mail, event, feedback, clubname });
    if (!result) {
      return res.status(500).json({ error: "Failed to append FeedBack data." });
    }

    res.json({ message: "FeedBack added successfully (Dual-Synced)", updates: result });
  } catch (err) {
    res.status(500).json({ error: "Server error while adding FeedBack." });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`RctcetBackend running with Strict Privilege Boundaries on http://localhost:${PORT}`);
});