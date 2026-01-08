# OAuth Email Alerts Blueprint for Text-Based Bot

## Overview
This blueprint describes how to implement OAuth-based email alert subscriptions in a text-based bot where users authenticate via external browser links (no embedded browser in chat).

---

## 1. OAuth Flow for Text-Based Bots

### 1.1 Architecture Overview

```
User → Bot Command → Bot generates OAuth URL → User clicks link → 
OAuth Provider → Redirect to your callback → Store tokens → 
Notify bot → User confirmed in chat
```

### 1.2 Step-by-Step Flow

#### Step 1: User Initiates Subscription
User sends a command like `/subscribe` or `/connect-gmail` in the bot chat.

**Implementation:**
- Create a command handler (e.g., `src/commands/subscribe.ts`)
- Generate a unique state token (UUID) to prevent CSRF attacks
- Store the state token temporarily with the user's bot user ID
- Generate OAuth authorization URL

#### Step 2: Generate OAuth Authorization URL

For Gmail (OAuth 2.0), you need:
- **Client ID** and **Client Secret** (from Google Cloud Console)
- **Redirect URI** (your callback endpoint, e.g., `https://your-bot-api.com/oauth/callback`)
- **Scopes**: `https://www.googleapis.com/auth/gmail.readonly` (for reading emails) or `https://www.googleapis.com/auth/gmail.send` (for sending)

**Example URL structure:**
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=YOUR_CLIENT_ID&
  redirect_uri=https://your-bot-api.com/oauth/callback&
  response_type=code&
  scope=https://www.googleapis.com/auth/gmail.readonly&
  access_type=offline&
  prompt=consent&
  state=UNIQUE_STATE_TOKEN
```

**Key parameters:**
- `access_type=offline`: Required to get refresh token
- `prompt=consent`: Forces consent screen to ensure refresh token is issued
- `state`: Your CSRF protection token

#### Step 3: Send Link to User
Send the OAuth URL as a clickable link in the bot chat. The bot should:
- Display a clear message: "Click here to authorize email access: [link]"
- Store the state token with expiration (e.g., 10 minutes)
- Associate state with the bot user ID

#### Step 4: User Clicks Link
User opens the link in their browser, authenticates with Google, and grants permissions.

#### Step 5: OAuth Callback Handler
When Google redirects to your callback URL, you receive:
- `code`: Authorization code (short-lived, ~10 minutes)
- `state`: Your CSRF token
- `error` (if user denied)

**Callback handler must:**
1. Validate the state token matches what you stored
2. Exchange the authorization code for access/refresh tokens
3. Store tokens securely
4. Associate tokens with the bot user ID
5. Send confirmation back to the bot (via webhook or polling)

#### Step 6: Exchange Code for Tokens

**POST request to Google token endpoint:**
```
POST https://oauth2.googleapis.com/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTHORIZATION_CODE&
client_id=YOUR_CLIENT_ID&
client_secret=YOUR_CLIENT_SECRET&
redirect_uri=https://your-bot-api.com/oauth/callback
```

**Response:**
```json
{
  "access_token": "ya29.a0AfH6...",
  "expires_in": 3599,
  "refresh_token": "1//0gX...",
  "scope": "https://www.googleapis.com/auth/gmail.readonly",
  "token_type": "Bearer"
}
```

#### Step 7: Notify Bot of Success
After storing tokens, notify the bot (via webhook, database polling, or direct API call) to send a confirmation message to the user in chat.

---

## 2. Data Models and Storage

### 2.1 Prisma Schema Extensions

Add these models to your `prisma/schema.prisma`:

```prisma
model User {
  id            String   @id @default(cuid())
  botUserId     String   @unique // The user ID from your bot platform (Mezon)
  email         String?  // User's email from OAuth provider
  provider      String   // "gmail", "outlook", etc.
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  oauthTokens   OAuthToken?
  subscriptions Subscription[]
  
  @@index([botUserId])
}

model OAuthToken {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  accessToken       String   // Encrypted
  refreshToken      String   // Encrypted
  expiresAt         DateTime // When access token expires
  tokenType         String   @default("Bearer")
  scope             String
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model OAuthState {
  id          String   @id @default(cuid())
  stateToken  String   @unique
  botUserId   String   // Temporary association
  expiresAt   DateTime // Clean up expired states
  createdAt   DateTime @default(now())
  
  @@index([stateToken])
  @@index([expiresAt])
}

model Subscription {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  alertType   String   // "new_email", "keyword_match", etc.
  keywords    String[] // Optional keywords to filter
  isActive    Boolean  @default(true)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@index([userId, isActive])
}
```

### 2.2 Data to Track

**User Data:**
- Bot platform user ID (Mezon user ID)
- Email address (from OAuth provider)
- OAuth provider type (Gmail, Outlook, etc.)

**OAuth Tokens:**
- Access token (encrypted)
- Refresh token (encrypted)
- Expiration timestamp
- Scopes granted

**Subscriptions:**
- User reference
- Alert type/configuration
- Active status
- Filter criteria (keywords, etc.)

**Temporary State:**
- OAuth state tokens (for CSRF protection)
- Expiration times for cleanup

---

## 3. Secure Token Storage

### 3.1 Encryption Strategy

**NEVER store tokens in plain text.** Use encryption at rest.

#### Option A: Application-Level Encryption (Recommended for simplicity)

Use a library like `crypto` (Node.js built-in) with AES-256-GCM:

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32-byte key from env
const ALGORITHM = 'aes-256-gcm';

function encrypt(text: string): { encrypted: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    Buffer.from(iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

**Store in database:**
```prisma
model OAuthToken {
  // ... other fields
  accessTokenEncrypted  String
  accessTokenIV         String
  accessTokenAuthTag    String
  refreshTokenEncrypted String
  refreshTokenIV        String
  refreshTokenAuthTag   String
}
```

#### Option B: Database-Level Encryption (PostgreSQL)

Use PostgreSQL's `pgcrypto` extension with `encrypt()` function, or use a service like AWS KMS, HashiCorp Vault.

### 3.2 Key Management

**Best Practices:**
1. **Generate encryption key:** `openssl rand -hex 32` (stores as `ENCRYPTION_KEY` env var)
2. **Never commit keys to git** (use `.env` file, add to `.gitignore`)
3. **Rotate keys periodically** (requires re-encryption of all tokens)
4. **Use different keys per environment** (dev, staging, prod)
5. **Store keys in secret management service** (AWS Secrets Manager, Azure Key Vault, etc.) for production

### 3.3 Token Association

**Linking tokens to users:**
1. When OAuth callback is received, you have the `state` token
2. Look up `OAuthState` by `stateToken` to get `botUserId`
3. Find or create `User` by `botUserId`
4. Store `OAuthToken` linked to that `User.id`
5. Delete the `OAuthState` record (one-time use)

**Example flow:**
```typescript
// In callback handler
const stateRecord = await prisma.oauthState.findUnique({
  where: { stateToken: state },
  include: { /* ... */ }
});

if (!stateRecord || stateRecord.expiresAt < new Date()) {
  throw new Error('Invalid or expired state token');
}

const user = await prisma.user.upsert({
  where: { botUserId: stateRecord.botUserId },
  update: { /* ... */ },
  create: {
    botUserId: stateRecord.botUserId,
    provider: 'gmail',
    // ...
  }
});

// Store encrypted tokens
const encryptedAccess = encrypt(accessToken);
const encryptedRefresh = encrypt(refreshToken);

await prisma.oauthToken.upsert({
  where: { userId: user.id },
  update: {
    accessTokenEncrypted: encryptedAccess.encrypted,
    accessTokenIV: encryptedAccess.iv,
    accessTokenAuthTag: encryptedAccess.authTag,
    refreshTokenEncrypted: encryptedRefresh.encrypted,
    refreshTokenIV: encryptedRefresh.iv,
    refreshTokenAuthTag: encryptedRefresh.authTag,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  },
  create: { /* ... */ }
});

// Clean up state
await prisma.oauthState.delete({ where: { id: stateRecord.id } });
```

---

## 4. Token Expiration and Refresh

### 4.1 Token Lifecycle

- **Access tokens:** Short-lived (typically 1 hour)
- **Refresh tokens:** Long-lived (can be revoked by user, but don't expire automatically)
- **Expiration handling:** Must refresh before access token expires

### 4.2 Automatic Refresh Strategy

#### Option A: Refresh on Demand (Recommended)

Refresh tokens when they're needed (lazy refresh):

```typescript
async function getValidAccessToken(userId: string): Promise<string> {
  const tokenRecord = await prisma.oauthToken.findUnique({
    where: { userId },
  });
  
  if (!tokenRecord) {
    throw new Error('No OAuth token found');
  }
  
  // Check if token is expired or expires soon (within 5 minutes)
  const expiresAt = tokenRecord.expiresAt;
  const now = new Date();
  const bufferTime = 5 * 60 * 1000; // 5 minutes
  
  if (expiresAt.getTime() - now.getTime() < bufferTime) {
    // Token expired or expiring soon, refresh it
    return await refreshAccessToken(tokenRecord);
  }
  
  // Token is still valid, decrypt and return
  return decrypt(
    tokenRecord.accessTokenEncrypted,
    tokenRecord.accessTokenIV,
    tokenRecord.accessTokenAuthTag
  );
}

async function refreshAccessToken(tokenRecord: OAuthToken): Promise<string> {
  const refreshToken = decrypt(
    tokenRecord.refreshTokenEncrypted,
    tokenRecord.refreshTokenIV,
    tokenRecord.refreshTokenAuthTag
  );
  
  // Call OAuth provider's token refresh endpoint
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  });
  
  if (!response.ok) {
    // Refresh token may be revoked
    throw new Error('Failed to refresh token - user may need to re-authorize');
  }
  
  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in || 3600;
  
  // Update stored token
  const encrypted = encrypt(newAccessToken);
  await prisma.oauthToken.update({
    where: { id: tokenRecord.id },
    data: {
      accessTokenEncrypted: encrypted.encrypted,
      accessTokenIV: encrypted.iv,
      accessTokenAuthTag: encrypted.authTag,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      updatedAt: new Date(),
    },
  });
  
  return newAccessToken;
}
```

#### Option B: Background Refresh Job

Run a scheduled job (cron) to refresh tokens before expiration:

```typescript
// Run every 30 minutes
async function refreshExpiringTokens() {
  const soon = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
  
  const expiringTokens = await prisma.oauthToken.findMany({
    where: {
      expiresAt: {
        lte: soon,
      },
    },
    include: { user: true },
  });
  
  for (const token of expiringTokens) {
    try {
      await refreshAccessToken(token);
    } catch (error) {
      // Log error, may need user re-authorization
      console.error(`Failed to refresh token for user ${token.userId}:`, error);
    }
  }
}
```

**Recommendation:** Use Option A (on-demand) for simplicity, but add Option B for critical systems where you want proactive refresh.

### 4.3 Handling Refresh Failures

When refresh fails, the refresh token may be:
- Revoked by user
- Expired (rare, but possible)
- Invalidated by provider

**Response:**
1. Mark token as invalid in database
2. Notify user via bot: "Your email connection has expired. Please reconnect: [link]"
3. Provide easy re-authentication flow

---

## 5. Fetching User Data and Sending Alerts

### 5.1 Fetching User Email Data

**Example: Fetching Gmail messages**

```typescript
async function fetchUserEmails(userId: string, maxResults: number = 10) {
  const accessToken = await getValidAccessToken(userId);
  
  // List messages
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  
  if (!listResponse.ok) {
    throw new Error(`Gmail API error: ${listResponse.statusText}`);
  }
  
  const listData = await listResponse.json();
  const messageIds = listData.messages?.map((m: any) => m.id) || [];
  
  // Fetch full message details
  const messages = await Promise.all(
    messageIds.map(async (id: string) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      return msgResponse.json();
    })
  );
  
  return messages;
}
```

### 5.2 Processing and Filtering

```typescript
async function checkForNewEmails(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { isActive: true },
      },
      oauthTokens: true,
    },
  });
  
  if (!user || !user.oauthTokens) {
    return;
  }
  
  const emails = await fetchUserEmails(userId, 20);
  
  // Filter based on subscription criteria
  for (const subscription of user.subscriptions) {
    const matchingEmails = emails.filter((email: any) => {
      // Check keywords if specified
      if (subscription.keywords.length > 0) {
        const subject = email.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || '';
        const snippet = email.snippet || '';
        const text = `${subject} ${snippet}`.toLowerCase();
        
        return subscription.keywords.some((keyword: string) =>
          text.includes(keyword.toLowerCase())
        );
      }
      return true; // No keywords = all emails
    });
    
    if (matchingEmails.length > 0) {
      await sendEmailAlert(user, subscription, matchingEmails);
    }
  }
}
```

### 5.3 Sending Alerts via Bot

```typescript
async function sendEmailAlert(
  user: User,
  subscription: Subscription,
  emails: any[]
) {
  // Get bot client (you'll need to pass this or make it accessible)
  const client = getBotClient(); // Your implementation
  
  // Find user's DM channel or preferred channel
  const channel = await client.channels.createDM(user.botUserId);
  
  // Format alert message
  const message = formatEmailAlert(subscription, emails);
  
  await channel.send({
    t: message,
  });
  
  // Log the alert
  await prisma.alertLog.create({
    data: {
      userId: user.id,
      subscriptionId: subscription.id,
      emailCount: emails.length,
      sentAt: new Date(),
    },
  });
}

function formatEmailAlert(subscription: Subscription, emails: any[]): string {
  let message = `📧 You have ${emails.length} new email(s) matching your alert:\n\n`;
  
  for (const email of emails.slice(0, 5)) { // Limit to 5 in message
    const subject = email.payload?.headers?.find((h: any) => h.name === 'Subject')?.value || 'No subject';
    const from = email.payload?.headers?.find((h: any) => h.name === 'From')?.value || 'Unknown';
    message += `• ${subject}\n  From: ${from}\n\n`;
  }
  
  if (emails.length > 5) {
    message += `... and ${emails.length - 5} more`;
  }
  
  return message;
}
```

### 5.4 Polling Strategy

**Option A: Scheduled Polling (Cron)**

```typescript
// Run every 5-15 minutes (adjust based on needs)
setInterval(async () => {
  const activeUsers = await prisma.user.findMany({
    where: {
      subscriptions: {
        some: { isActive: true },
      },
      oauthTokens: { isNot: null },
    },
    include: { subscriptions: { where: { isActive: true } } },
  });
  
  for (const user of activeUsers) {
    try {
      await checkForNewEmails(user.id);
    } catch (error) {
      console.error(`Error checking emails for user ${user.id}:`, error);
    }
  }
}, 10 * 60 * 1000); // 10 minutes
```

**Option B: Gmail Push Notifications (Advanced)**

Use Gmail's push notifications via Google Cloud Pub/Sub for real-time alerts (more complex, but more efficient).

---

## 6. Common Pitfalls and Security Considerations

### 6.1 Security Best Practices

#### ✅ DO:
1. **Always use HTTPS** for OAuth callback URLs
2. **Validate state tokens** to prevent CSRF attacks
3. **Encrypt tokens at rest** (never store plain text)
4. **Use environment variables** for secrets (never hardcode)
5. **Implement rate limiting** on OAuth endpoints
6. **Log security events** (failed auth attempts, token refresh failures)
7. **Set appropriate token expiration** in database
8. **Clean up expired state tokens** regularly
9. **Use least-privilege scopes** (only request what you need)
10. **Validate redirect URIs** match exactly what's registered

#### ❌ DON'T:
1. **Don't log tokens** in plain text (even in error logs)
2. **Don't expose tokens in URLs** (use POST for token exchange)
3. **Don't share tokens between users** (always associate with user)
4. **Don't ignore token expiration** (always check before use)
5. **Don't store state tokens permanently** (delete after use)
6. **Don't trust user input** in OAuth callbacks (validate everything)
7. **Don't use HTTP** for OAuth (only HTTPS)
8. **Don't commit secrets to git** (use `.env` and `.gitignore`)

### 6.2 Common Pitfalls

#### Pitfall 1: Missing Refresh Token
**Problem:** If `prompt=consent` is not used, Google may not issue a refresh token on subsequent authorizations.

**Solution:** Always include `prompt=consent` or `prompt=select_account` in the authorization URL.

#### Pitfall 2: Token Expiration Race Conditions
**Problem:** Multiple concurrent requests try to refresh the same token simultaneously.

**Solution:** Use database locking or a mutex:
```typescript
// Using Prisma transaction with locking
const token = await prisma.$transaction(async (tx) => {
  return await tx.oauthToken.findUnique({
    where: { userId },
    // Lock the row
  });
}, { isolationLevel: 'Serializable' });
```

#### Pitfall 3: State Token Reuse
**Problem:** Reusing state tokens allows replay attacks.

**Solution:** Delete state tokens immediately after use (one-time use only).

#### Pitfall 4: Insufficient Error Handling
**Problem:** Silent failures when tokens are revoked.

**Solution:** Implement comprehensive error handling and user notification:
```typescript
try {
  await checkForNewEmails(userId);
} catch (error: any) {
  if (error.message.includes('invalid_grant') || error.message.includes('401')) {
    // Token revoked, notify user
    await notifyUserReauthRequired(userId);
    await prisma.oauthToken.delete({ where: { userId } });
  }
}
```

#### Pitfall 5: Rate Limiting
**Problem:** Gmail API has rate limits (250 quota units per user per second).

**Solution:** Implement rate limiting and exponential backoff:
```typescript
async function fetchWithRetry(url: string, options: RequestInit, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      // Rate limited
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60');
      await sleep(retryAfter * 1000);
      continue;
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}
```

#### Pitfall 6: Scope Creep
**Problem:** Requesting too many scopes scares users or gets rejected.

**Solution:** Request only necessary scopes:
- Reading emails: `https://www.googleapis.com/auth/gmail.readonly`
- Sending emails: `https://www.googleapis.com/auth/gmail.send`
- Both: `https://www.googleapis.com/auth/gmail.modify`

### 6.3 Additional Security Measures

1. **IP Whitelisting:** Restrict OAuth callback endpoint to known IPs if possible
2. **Request Signing:** Sign OAuth state tokens with HMAC for additional validation
3. **Audit Logging:** Log all OAuth events (authorization, token refresh, failures)
4. **Token Rotation:** Periodically require users to re-authenticate (e.g., every 90 days)
5. **Anomaly Detection:** Monitor for unusual patterns (many failed auths, token theft indicators)

---

## 7. Implementation Checklist

### Phase 1: Setup
- [ ] Create OAuth app in Google Cloud Console (or other provider)
- [ ] Configure redirect URI
- [ ] Get Client ID and Client Secret
- [ ] Set up environment variables
- [ ] Generate encryption key for token storage

### Phase 2: Database Schema
- [ ] Add User model to Prisma schema
- [ ] Add OAuthToken model with encryption fields
- [ ] Add OAuthState model for CSRF protection
- [ ] Add Subscription model
- [ ] Run Prisma migrations

### Phase 3: OAuth Flow
- [ ] Create `/subscribe` command handler
- [ ] Implement state token generation
- [ ] Create OAuth authorization URL generator
- [ ] Set up OAuth callback endpoint (web server)
- [ ] Implement token exchange logic
- [ ] Add token encryption/decryption utilities
- [ ] Link tokens to users in database

### Phase 4: Token Management
- [ ] Implement token refresh logic
- [ ] Add expiration checking
- [ ] Handle refresh failures gracefully
- [ ] Add cleanup job for expired state tokens

### Phase 5: Email Fetching
- [ ] Implement Gmail API client
- [ ] Add email fetching with token refresh
- [ ] Implement filtering logic
- [ ] Add rate limiting and retry logic

### Phase 6: Alert System
- [ ] Create subscription management commands
- [ ] Implement email polling job
- [ ] Format and send alert messages via bot
- [ ] Add alert logging

### Phase 7: Security & Testing
- [ ] Test OAuth flow end-to-end
- [ ] Test token refresh scenarios
- [ ] Test error handling (revoked tokens, etc.)
- [ ] Security audit (encryption, CSRF protection)
- [ ] Load testing for rate limits

---

## 8. Example Code Structure

```
src/
├── commands/
│   ├── subscribe.ts          # /subscribe command
│   ├── unsubscribe.ts        # /unsubscribe command
│   └── list-subscriptions.ts # /my-subscriptions command
├── services/
│   ├── oauthService.ts       # OAuth URL generation, token exchange
│   ├── tokenService.ts       # Token encryption, refresh, validation
│   ├── emailService.ts       # Gmail API client, email fetching
│   └── alertService.ts       # Alert processing and sending
├── handlers/
│   └── oauthCallback.ts      # OAuth callback handler (web endpoint)
├── utils/
│   └── encryption.ts         # Encryption/decryption utilities
└── jobs/
    └── emailPolling.ts       # Scheduled email checking job
```

---

## 9. Environment Variables Needed

```env
# OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=https://your-bot-api.com/oauth/callback

# Encryption
ENCRYPTION_KEY=your_32_byte_hex_key  # Generate with: openssl rand -hex 32

# Database (existing)
DATABASE_URL=postgresql://...

# Bot (existing)
BOT_ID=...
APPLICATION_TOKEN=...

# Web Server (for OAuth callback)
PORT=3000
CALLBACK_BASE_URL=https://your-bot-api.com
```

---

## 10. Next Steps

1. **Set up OAuth app** in your chosen provider's console
2. **Extend Prisma schema** with the models above
3. **Implement encryption utilities** for token storage
4. **Create OAuth flow** (command → URL → callback → storage)
5. **Add token refresh logic** with proper error handling
6. **Implement email fetching** with your bot's API
7. **Build alert system** with polling and filtering
8. **Test thoroughly** with real OAuth flows
9. **Deploy securely** with proper secret management

---

This blueprint provides a complete foundation for implementing OAuth email alerts in your text-based bot. Adapt the examples to your specific bot framework (Mezon) and requirements.

