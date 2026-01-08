
/**
 * Encode bot user ID into state token (simple approach, no database)
 */
export function encodeStateToken(botUserId: string): string {
  const timestamp = Date.now();
  const data = `${botUserId}:${timestamp}`;
  const encoded = Buffer.from(data).toString("base64url");
  return encoded;
}

/**
 * Decode state token to get bot user ID
 */
export function decodeStateToken(stateToken: string): string | null {
  try {
    const decoded = Buffer.from(stateToken, "base64url").toString("utf-8");
    const [botUserId] = decoded.split(":");
    return botUserId || null;
  } catch (error) {
    return null;
  }
}

/**
 * Generate Gmail OAuth authorization URL
 * Scope includes send permission so the bot can send emails.
 */
export function generateGmailOAuthUrl(botUserId: string, redirectUri: string, clientId: string): string {
  // Request both Gmail readonly and userinfo.email scopes
  // userinfo.email is needed to get the user's email address
  const scopes = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.send",
  ].join(" ");

  // Encode user ID in state (no database needed)
  const stateToken = encodeStateToken(botUserId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state: stateToken,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

