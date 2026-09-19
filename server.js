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
import { getAllEvents, getEvent, toggleEvent, deleteEvent, createEvent, editEvent } from "./SRC/Events.js";
import { getAllUsers, assignPosition } from "./SRC/Roles.js";
import { submitRegistration, getEventCounts } from "./SRC/Registrations.js";

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
  res.send("Hello! The RC TCET website has been developed by Rtr. Fuzail and Rtr. Mihir for RI Year 2026-27!");
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

/* -------------------------------------------------------------------------- */
/*                         ROLE MANAGEMENT (PRESIDENT ONLY)                   */
/* -------------------------------------------------------------------------- */

// ADMIN: Get current user profile
app.get("/api/admin/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ADMIN: Get all users
app.get(
  "/api/admin/users",
  requirePermission({ isMasterAdminOnly: true }),
  async (req, res) => {
    try {
      const users = await getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Failed to fetch users." });
    }
  }
);

// ADMIN: Assign position
app.post(
  "/api/admin/assign-position",
  requirePermission({ isMasterAdminOnly: true }),
  async (req, res) => {
    try {
      const { targetUid, newPosition, roles } = req.body;
      if (!targetUid || !newPosition) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      const result = await assignPosition(targetUid, newPosition, roles);
      res.json(result);
    } catch (error) {
      console.error("Error assigning position:", error);
      res.status(500).json({ error: "Failed to assign position." });
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
/*                         EVENTS MANAGEMENT (APPS SCRIPT PORT)               */
/* -------------------------------------------------------------------------- */

// PUBLIC: Get all active, future events
app.get("/api/events", async (req, res) => {
  try {
    const events = await getAllEvents(true);
    res.json(events);
  } catch (error) {
    console.error("Error fetching public events:", error);
    res.status(500).json({ error: "Failed to fetch events." });
  }
});

// PUBLIC: Get a single event by ID
app.get("/api/events/:id", async (req, res) => {
  try {
    const event = await getEvent(req.params.id);
    res.json(event);
  } catch (error) {
    if (error.message === "Event not found") {
      return res.status(404).json({ error: "Event not found" });
    }
    console.error("Error fetching event:", error);
    res.status(500).json({ error: "Failed to fetch event." });
  }
});

// ADMIN: Get all events (including inactive & past)
app.get(
  "/api/admin/events",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const events = await getAllEvents(false);
      res.json(events);
    } catch (error) {
      console.error("Error fetching admin events:", error);
      res.status(500).json({ error: "Failed to fetch events." });
    }
  }
);

// ADMIN: Toggle Event Active Status
app.post(
  "/api/admin/events/:id/toggle",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const result = await toggleEvent(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Error toggling event:", error);
      res.status(500).json({ error: "Failed to toggle event status." });
    }
  }
);

// ADMIN: Delete (Deactivate) Event
app.delete(
  "/api/admin/events/:id",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const result = await deleteEvent(req.params.id);
      res.json(result);
    } catch (error) {
      console.error("Error deleting event:", error);
      res.status(500).json({ error: "Failed to delete event." });
    }
  }
);

// ADMIN: Get Event Registration Counts
app.get(
  "/api/admin/events/counts",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const counts = await getEventCounts();
      res.json(counts);
    } catch (error) {
      console.error("Error fetching event counts:", error);
      res.status(500).json({ error: "Failed to fetch event counts." });
    }
  }
);

// ADMIN: Create Event (Dual-Sync to Firestore & Apps Script)
app.post(
  "/api/admin/events",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const data = await createEvent(req.body);
      res.json(data);
    } catch (error) {
      console.error("Error creating event:", error);
      res.status(500).json({ error: "Failed to create event." });
    }
  }
);

// ADMIN: Edit Event (Dual-Sync to Firestore & Apps Script)
app.put(
  "/api/admin/events/:id",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT"] }),
  async (req, res) => {
    try {
      const data = await editEvent(req.params.id, req.body);
      res.json(data);
    } catch (error) {
      console.error("Error editing event:", error);
      res.status(500).json({ error: "Failed to edit event." });
    }
  }
);

// PUBLIC: Submit Event Registration (Dual-Sync to Firestore & Apps Script)
app.post("/api/events/:id/register", async (req, res) => {
  try {
    const data = await submitRegistration(req.params.id, req.body);
    res.json(data);
  } catch (error) {
    console.error("Error submitting registration:", error);
    res.status(500).json({ error: "Failed to submit registration." });
  }
});

/* -------------------------------------------------------------------------- */
/*                         ATTENDANCE & MEMBERSHIP                            */
/* -------------------------------------------------------------------------- */

// PUBLIC: Get members for attendance dropdown
app.get("/api/attendance/members", async (req, res) => {
  try {
    const { getAllUsers } = await import("./SRC/Roles.js");
    const users = await getAllUsers();

    // Group them for the frontend as homeMembers
    const homeMembers = users.map(u => ({ name: u.name, email: u.email }));

    res.json({
      homeMembers: homeMembers,
      ambassadorials: [],
      nonRotaractors: []
    });
  } catch (error) {
    console.error("Error fetching members from Firestore:", error);
    res.status(500).json({ error: "Failed to fetch members." });
  }
});

// ADMIN: Submit attendance (Requires POST)
app.post(
  "/api/attendance",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT", "SAA"] }),
  async (req, res) => {
    try {
      const response = await fetch(process.env.VITE_GOOGLE_APPS_SCRIPT_MEMBERSHIP_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error submitting attendance:", error);
      res.status(500).json({ error: "Failed to submit attendance." });
    }
  }
);

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