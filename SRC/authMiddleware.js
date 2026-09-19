import { auth, db } from "./firebase.js";

/**
 * Middleware to verify Firebase ID Token (Bearer Token)
 * Attaches user profile, position, and assignedAvenues to req.user
 */
export async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn(`[verifyAuth] Missing or invalid auth header on ${req.method} ${req.url}:`, authHeader);
    req.user = null;
    return next();
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    if (!auth) {
      req.user = null;
      return next();
    }

    const decodedToken = await auth.verifyIdToken(idToken);
    const { uid, email } = decodedToken;

    // Fetch position & assigned avenues from Firestore users collection
    let userProfile = {
      uid,
      email,
      position: "GBM", // Default to General Body Member (GBM)
      roles: ["MEMBER"],
      assignedAvenues: [],
      name: decodedToken.name || email.split("@")[0],
    };

    if (db) {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        userProfile = { ...userProfile, ...userDoc.data() };
      }
    }

    req.user = userProfile;
    next();
  } catch (error) {
    console.error("Error verifying Firebase auth token:", error.message, error);
    req.user = null;
    next();
  }
}

/**
 * Middleware enforcing mandatory authentication
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  next();
}

/**
 * Strict Permission Middleware enforcing RCTCET Privilege Boundaries:
 * - PRESIDENT: Master access to all routes, ledgers, and settings.
 * - SECRETARY: High executive access.
 * - JOINT_SECRETARY: Limited executive access (subordinate to Secretary).
 * - SAA: SAA fine ledger (Strictly SAA & PRESIDENT only).
 * - CPF: Finance ledger (Strictly CPF & PRESIDENT only).
 */
export function requirePermission({
  allowedPositions = [],
  requiredAvenue = null,
  isSaaOnly = false,
  isFinanceOnly = false,
  isMasterAdminOnly = false,
} = {}) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const { position, assignedAvenues = [], roles = [] } = req.user;
    const normalizedPosition = (position || "").toUpperCase();

    // Master Admin Override: PRESIDENT has full master access to everything
    if (normalizedPosition === "PRESIDENT" || roles.includes("MASTER_ADMIN")) {
      return next();
    }

    // Master Admin Only routes (e.g. Master Role Assignment)
    if (isMasterAdminOnly) {
      return res.status(403).json({ error: "Access denied. Restricted strictly to the President." });
    }

    // SAA Only routes (Strictly SAA & PRESIDENT only; no CPF or others)
    if (isSaaOnly) {
      if (normalizedPosition === "SAA" || roles.includes("SAA")) {
        return next();
      }
      return res.status(403).json({ error: "Access denied. Restricted strictly to SAA and President." });
    }

    // Finance Only routes (Strictly CPF & PRESIDENT only; no SAA or others)
    if (isFinanceOnly) {
      if (normalizedPosition === "CPF" || roles.includes("FINANCE")) {
        return next();
      }
      return res.status(403).json({ error: "Access denied. Restricted strictly to CPF and President." });
    }

    // Secretary access (High executive access)
    if (normalizedPosition === "SECRETARY" || roles.includes("SECRETARY")) {
      return next();
    }

    // Joint Secretary access (Limited executive access)
    if (normalizedPosition === "JOINT_SECRETARY" || roles.includes("JOINT_SECRETARY")) {
      if (allowedPositions.includes("JOINT_SECRETARY") || allowedPositions.length === 0) {
        return next();
      }
    }

    // Check specific allowed positions
    if (allowedPositions.length > 0) {
      const hasPosition = allowedPositions.some(
        (pos) => pos.toUpperCase() === normalizedPosition || roles.includes(pos.toUpperCase())
      );
      if (hasPosition) {
        return next();
      }
    }

    // Check avenue match
    if (requiredAvenue) {
      const hasAvenue =
        assignedAvenues.includes("ALL") ||
        assignedAvenues.some((av) => av.toLowerCase() === requiredAvenue.toLowerCase());
      if (hasAvenue) {
        return next();
      }
    }

    return res.status(403).json({ error: "Access denied. Insufficient position or avenue permissions." });
  };
}
