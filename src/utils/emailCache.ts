/**
 * Simple in-memory cache for email data
 * Stores emails temporarily to avoid re-fetching from Gmail API
 */

export interface CachedEmail {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  timestamp: number;
  cachedAt: number;
}

const emailCache = new Map<string, CachedEmail>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Store email in cache
 */
export function cacheEmail(email: {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  timestamp: number;
}): void {
  emailCache.set(email.id, {
    ...email,
    cachedAt: Date.now(),
  });
  console.log(`[CACHE] Stored email ${email.id} in cache. Total cached: ${emailCache.size}`);
}

/**
 * Get email from cache
 */
export function getCachedEmail(emailId: string): CachedEmail | null {
  const cached = emailCache.get(emailId);
  
  if (!cached) {
    // Log all cached email IDs for debugging
    const cachedIds = Array.from(emailCache.keys());
    console.log(`[CACHE] Email ${emailId} not found. Cached IDs:`, cachedIds);
    return null;
  }

  // Check if cache is still valid
  if (Date.now() - cached.cachedAt > CACHE_TTL) {
    emailCache.delete(emailId);
    console.log(`[CACHE] Email ${emailId} expired`);
    return null;
  }

  console.log(`[CACHE] Email ${emailId} found in cache`);
  return cached;
}

/**
 * Clear expired cache entries
 */
export function clearExpiredCache(): void {
  const now = Date.now();
  for (const [id, cached] of emailCache.entries()) {
    if (now - cached.cachedAt > CACHE_TTL) {
      emailCache.delete(id);
    }
  }
}

// Clean up cache every 10 minutes
setInterval(clearExpiredCache, 10 * 60 * 1000);
