import { db } from "./firebase.js";

/**
 * Get the HRD Attendance Report
 * - Fetches all Core and BOD members
 * - Fetches the last 3 events (sorted by date descending)
 * - Checks attendance for those 3 events
 * - Calculates consecutive absence streak
 */
export async function getHrdReport() {
  if (!db) throw new Error("Firestore not initialized");

  // 1. Fetch all members (Core, BOD, Working Committee, GBM)
  const membersSnapshot = await db.collection("members").get();

  const members = membersSnapshot.docs.map(doc => {
    const data = doc.data();
    // Normalise names since older db might use different cases
    const firstName = data["First Name"] || data["Name"] || "";
    const lastName = data["Last Name"] || "";
    const fullName = `${firstName} ${lastName}`.trim();

    return {
      id: doc.id,
      fullName: fullName,
      email: data["Email"] || data["email"] || "",
      phone: data["Mobile"] || data["Mobile Number"] || data["Phone"] || "",
      category: data["Category"] || "GBM",
      position: data["Position"] || "Member",
    };
  });

  // 2. Fetch ALL past events
  const todayStr = new Date().toISOString().split('T')[0];
  const eventsSnapshot = await db.collection("events").get();

  let allPastEvents = [];
  eventsSnapshot.forEach(doc => {
    const ev = doc.data();
    if (ev.date) {
      const parsedTime = new Date(ev.date).getTime();
      // Only include valid dates that happened TODAY or in the PAST
      if (!isNaN(parsedTime) && parsedTime <= new Date(todayStr).getTime()) {
        allPastEvents.push({
          id: doc.id,
          eventName: ev.eventName,
          date: ev.date,
          parsedTime: parsedTime
        });
      }
    }
  });

  // Sort strictly by the parsed actual date, descending (most recent past event first)
  allPastEvents.sort((a, b) => b.parsedTime - a.parsedTime);

  const last3Events = allPastEvents.slice(0, 3);
  const totalEventsCount = allPastEvents.length;

  // 3. Fetch ALL attendance records
  const attendanceSnapshot = await db.collection("attendance").get();
  const attendanceRecords = {}; // Key: eventName, Value: Array of attendee names (lowercase)

  attendanceSnapshot.forEach(doc => {
    const data = doc.data();
    attendanceRecords[data.eventName] = (data.attendees || []).map(a => String(a.name).toLowerCase().trim());
  });

  // 4. Calculate Attendance & Streak
  const report = members.map(member => {
    let consecutiveAbsences = 0;
    let streakBroken = false;
    let totalAttended = 0;
    const memberNameLower = member.fullName.toLowerCase();

    const attendanceHistory = [];

    // Calculate total attended over ALL past events
    for (const event of allPastEvents) {
      const attendees = attendanceRecords[event.eventName] || [];
      const isPresent = attendees.includes(memberNameLower);
      if (isPresent) {
        totalAttended++;
      }
    }

    // Check streak from ONLY most recent 3 events
    for (const event of last3Events) {
      const attendees = attendanceRecords[event.eventName] || [];
      const isPresent = attendees.includes(memberNameLower);

      attendanceHistory.push({
        eventName: event.eventName,
        date: event.date,
        present: isPresent
      });

      if (!isPresent && !streakBroken) {
        consecutiveAbsences++;
      } else {
        streakBroken = true; // Once they are present, the streak of absences is broken
      }
    }

    const overallPercentage = totalEventsCount > 0
      ? Math.round((totalAttended / totalEventsCount) * 100)
      : 0;

    return {
      ...member,
      consecutiveAbsences,
      attendanceHistory,
      totalAttended,
      totalEventsCount,
      overallPercentage
    };
  });

  // 5. Sort so highest absences are at the top
  report.sort((a, b) => b.consecutiveAbsences - a.consecutiveAbsences);

  return {
    eventsTracked: last3Events,
    report: report
  };
}
