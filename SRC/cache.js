// In-Memory Cache with 60-Minute TTL and Smart Invalidation
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes in milliseconds

const store = {
  eventsPublic: { data: null, timestamp: 0 },
  eventsAdmin: { data: null, timestamp: 0 },
  eventCounts: { data: null, timestamp: 0 },
  attendanceMembers: { data: null, timestamp: 0 },
  saafine: { data: null, timestamp: 0 },
  membersWebRegi: { data: null, timestamp: 0 },
  membersOld: { data: null, timestamp: 0 }
};

/**
 * Retrieve cached data if fresh (within 60 minutes)
 * @param {string} key - Cache identifier
 * @returns {any|null}
 */
export const getCache = (key) => {
  const item = store[key];
  if (item && item.data !== null && (Date.now() - item.timestamp < CACHE_TTL)) {
    return item.data;
  }
  return null;
};

/**
 * Store data in RAM cache with current timestamp
 * @param {string} key - Cache identifier
 * @param {any} data - Data to store
 */
export const setCache = (key, data) => {
  store[key] = {
    data,
    timestamp: Date.now()
  };
};

/**
 * Invalidate specific cache keys or clear all if none specified
 * @param {...string} keys - Keys to invalidate
 */
export const invalidateCache = (...keys) => {
  if (!keys || keys.length === 0) {
    // Clear all
    Object.keys(store).forEach((k) => {
      store[k] = { data: null, timestamp: 0 };
    });
  } else {
    keys.forEach((k) => {
      if (store[k]) {
        store[k] = { data: null, timestamp: 0 };
      }
    });
  }
};

/**
 * Get current cache status (useful for admin diagnostics)
 */
export const getCacheStats = () => {
  const now = Date.now();
  const stats = {};
  Object.keys(store).forEach((k) => {
    const item = store[k];
    const isCached = item.data !== null;
    const ageSeconds = isCached ? Math.round((now - item.timestamp) / 1000) : 0;
    const remainingSeconds = isCached ? Math.max(0, Math.round((CACHE_TTL - (now - item.timestamp)) / 1000)) : 0;
    stats[k] = {
      cached: isCached,
      ageSeconds,
      remainingSeconds
    };
  });
  return stats;
};
