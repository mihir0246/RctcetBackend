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
import { getHrdReport } from "./SRC/HRD.js";

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
/*                           HRD DASHBOARD                                    */
/* -------------------------------------------------------------------------- */

// READ HRD Report (Restricted to CP_HRD, PRESIDENT, etc)
app.get(
  "/api/admin/hrd-report",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT", "CP_HRD"] }),
  async (req, res) => {
    try {
      const reportData = await getHrdReport();
      res.json(reportData);
    } catch (error) {
      console.error("Error fetching HRD report:", error);
      res.status(500).json({ error: "Failed to fetch HRD report." });
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

// PUBLIC: Submit Member Registration (Dual-Sync to Firestore & Apps Script)
app.post("/api/members/register", async (req, res) => {
  try {
    const { db } = await import("./SRC/firebase.js");
    if (!db) throw new Error("Firestore database is not initialized.");

    // 1. Save directly to Firebase (using the collection specific to Web Registrations)
    const memberRef = db.collection("membersWebRegi").doc();
    const entry = {
      ...req.body,
      createdAt: new Date().toISOString()
    };
    await memberRef.set(entry);

    // 2. Dual-sync securely to Google Sheets in background
    fetch(process.env.VITE_GOOGLE_APPS_SCRIPT_MEMBERSHIP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body)
    }).catch(err => console.error("[Dual-Sync Error] Failed to sync member registration:", err.message));

    res.json({ success: true, message: "Membership registration submitted successfully." });
  } catch (error) {
    console.error("Error submitting member registration:", error);
    res.status(500).json({ error: "Failed to submit membership registration." });
  }
});

/* -------------------------------------------------------------------------- */
/*                         ATTENDANCE & MEMBERSHIP                            */
/* -------------------------------------------------------------------------- */

// PUBLIC: Get members for attendance dropdown
app.get("/api/attendance/members", async (req, res) => {
  try {
    const { db } = await import("./SRC/firebase.js");

    // 1. Calculate Active Event
    let activeEventStr = "";
    const today = new Date();
    // Convert to string format that matches Firestore (e.g. "2026-09-26")
    const todayStr = today.toISOString().split('T')[0];

    const eventsSnap = await db.collection("events").get();
    let closestEvent = null;
    let smallestTimeDiff = Infinity;

    eventsSnap.forEach(doc => {
      const ev = doc.data();
      if (ev.date) {
        try {
          // We parse date, ignoring time
          const evDate = new Date(ev.date);

          // If the date is invalid (like "M"), skip it completely so it doesn't crash
          if (isNaN(evDate.getTime())) return;

          const evDateStr = evDate.toISOString().split('T')[0];

          if (evDateStr === todayStr) {
            activeEventStr = ev.eventName;
          } else {
            // Fallback: find the most recent past event
            const diff = today.getTime() - evDate.getTime();
            if (diff > 0 && diff < smallestTimeDiff) {
              smallestTimeDiff = diff;
              closestEvent = ev.eventName;
            }
          }
        } catch (err) {
          // Just silently skip any event that fails to parse
        }
      }
    });

    if (!activeEventStr && closestEvent) {
      activeEventStr = closestEvent;
    }

    // 2. Fetch Home Members
    const membersSnap = await db.collection("members").get();
    const homeMembers = membersSnap.docs.map(doc => {
      const data = doc.data();
      const firstName = data["First Name"] || data["Name"] || "";
      const lastName = data["Last Name"] || "";
      const fullName = `${firstName} ${lastName}`.trim();
      return {
        name: fullName,
        email: data["Email"] || data["email"] || "",
        phone: data["Mobile"] || data["Mobile Number"] || data["Phone"] || "",
        department: data["Department"] || data["Branch"] || "",
        yearOfStudy: data["Year"] || data["Year of Study"] || "",
        division: data["Division"] || "",
        rollNumber: data["Roll Number"] || data["Roll No"] || ""
      };
    });

    // 3. Fetch Ambassadorials
    const ambaSnap = await db.collection("ambassadorials").get();
    const ambassadorials = ambaSnap.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.name || data.Name || "",
        email: data.email || data.Email || "",
        phone: data.phone || data.Phone || "",
        college: data.college || data.College || "",
      };
    });

    res.json({
      status: "success",
      activeEvent: activeEventStr,
      homeMembers: homeMembers,
      ambassadorials: ambassadorials,
      nonRotaractors: []
    });
  } catch (error) {
    console.error("Error fetching attendance members:", error);
    res.status(500).json({ status: "error", error: "Failed to fetch members." });
  }
});

// PUBLIC: Fetch user details by name to pre-fill registration form
app.post("/api/members/prefill", async (req, res) => {
  try {
    const { firstName, lastName, fullName } = req.body;

    let searchFirst = "";
    let searchLast = "";

    if (fullName) {
      const parts = fullName.trim().split(" ");
      searchFirst = parts[0].toLowerCase();
      searchLast = parts.length > 1 ? parts.slice(1).join(" ").toLowerCase() : "";
    } else if (firstName && lastName) {
      searchFirst = firstName.trim().toLowerCase();
      searchLast = lastName.trim().toLowerCase();
    } else {
      return res.status(400).json({ error: "Name is required." });
    }

    const { db } = await import("./SRC/firebase.js");
    if (!db) throw new Error("Firestore database is not initialized.");

    // Search in the NEW Web Registrations collection (membersWebRegi)
    const newRegSnapshot = await db.collection("membersWebRegi").get();
    for (const doc of newRegSnapshot.docs) {
      const data = doc.data();
      const dbFirst = (data.firstName || "").toLowerCase().trim();
      const dbLast = (data.lastName || "").toLowerCase().trim();
      const dbFull = `${dbFirst} ${dbLast}`.trim();

      if (
        (dbFirst === searchFirst && dbLast === searchLast) ||
        (fullName && dbFull === fullName.trim().toLowerCase())
      ) {
        return res.json({ found: true, data }); // Perfect match in new database
      }
    }

    // Search in the OLD migrated members collection (members)
    const oldRegSnapshot = await db.collection("members").get();
    for (const doc of oldRegSnapshot.docs) {
      const data = doc.data();
      // Old sheet uses "First Name" and "Last Name"
      const oldFirst = (data["First Name"] || data["Name"] || "").toLowerCase().trim();
      const oldLast = (data["Last Name"] || "").toLowerCase().trim();
      const oldFull = `${oldFirst} ${oldLast}`.trim();

      // Check if it matches exactly, or if "First Name" contained both (e.g. "Ajay Sharma")
      if (
        (oldFirst === searchFirst && oldLast === searchLast) ||
        (oldFirst === `${searchFirst} ${searchLast}`) ||
        (fullName && oldFull === fullName.trim().toLowerCase()) ||
        (fullName && oldFirst === fullName.trim().toLowerCase())
      ) {
        // Map old sheet headers to new form camelCase fields
        const mappedData = {
          email: data["Email"] || data["email"] || "",
          personalEmail: data["Personal mail ID"] || "",
          gsuiteId: data["Gsuite ID"] || "",
          firstName: data["First Name"] || searchFirst,
          middleName: data["Middle Name"] || "",
          lastName: data["Last Name"] || searchLast,
          dob: data["Date of Birth"] || "",
          gender: data["Gender"] || "",
          bloodGroup: data["Blood Group"] || "",
          phone: data["Mobile Number"] || data["Phone"] || "",
          year: data["Year"] || "",
          department: data["Department"] || "",
          division: data["Division"] || "",
          rollNumber: data["Roll Number"] || "",
          addressLine1: data["Residential Address Line 1"] || "",
          addressLine2: data["Residential Address Line 2"] || "",
          addressLine3: data["Residential Address Line 3"] || "",
          pincode: data["Pincode"] || "",
          city: data["City"] || "",
          railwayStation: data["Nearby Railway Station"] || "",
          fatherName: data["Full Name of Father"] || "",
          fatherAge: data["Age of Father"] || "",
          fatherOccupation: data["Occupation of Father"] || "",
          motherName: data["Full Name of Mother"] || "",
          motherAge: data["Age of Mother"] || "",
          motherOccupation: data["Occupation of Mother"] || "",
          parentContact: data["Contact No.of your parent"] || "",
          hasSiblings: data["Any Siblings?"] || "",
          siblingCount: data["If yes, How many?"] || "",
          rotaractYear: data["Rotaract Year"] || "",
          hobbies: data["Any Hobbies/Skills?"] || "",
          helpWith: data["You can help us with"] ? data["You can help us with"].split(",") : [],
          playSports: data["Do you play any sports?"] || "",
          sportsAchievement: data["Achievement in sports?"] || "",
          culturalActivities: data["Cultural activities?"] ? data["Cultural activities?"].split(",") : [],
          culturalAchievement: data["Achievement in cultural?"] || ""
        };
        return res.json({ found: true, data: mappedData });
      }
    }

    // No match found
    return res.json({ found: false });
  } catch (error) {
    console.error("Error fetching prefill data:", error);
    res.status(500).json({ error: "Failed to fetch prefill data." });
  }
});

// ADMIN: Submit attendance (Requires POST)
app.post(
  "/api/attendance",
  requirePermission({ allowedPositions: ["PRESIDENT", "SECRETARY", "JOINT_SECRETARY", "VICE_PRESIDENT", "SAA", "CP_HRD"] }),
  async (req, res) => {
    try {
      const { db } = await import("./SRC/firebase.js");
      if (db) {
        // Save to Firestore in a collection grouped by event
        const { event, name, email } = req.body;
        if (event && name) {
          const eventDocRef = db.collection("attendance").doc(event);
          const doc = await eventDocRef.get();

          let attendees = [];
          if (doc.exists) {
            attendees = doc.data().attendees || [];
          }

          // Prevent duplicates
          if (!attendees.some(a => a.name === name)) {
            attendees.push({
              name: name,
              email: email || "",
              timestamp: new Date().toISOString()
            });
            await eventDocRef.set({
              eventName: event,
              attendees: attendees,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
        }
      }

      // Respond to frontend immediately for blazing fast UI!
      res.json({ 
        status: "success", 
        message: "Attendance logged to Firestore (syncing to sheets in background)" 
      });

      // Dual-Sync to Apps Script in the background (fire-and-forget)
      const appsScriptPayload = {
        ...req.body,
        pin: "rctcet"
      };

      fetch(process.env.VITE_GOOGLE_APPS_SCRIPT_ATTENDANCE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(appsScriptPayload)
      }).then(r => r.json()).then(data => {
        if (data.status !== 'success') {
          console.error("Apps Script background sync issue:", data.message);
        }
      }).catch(err => {
        console.error("Background Apps Script sync failed:", err);
      });

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