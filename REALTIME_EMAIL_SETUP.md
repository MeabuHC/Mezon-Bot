# Real-Time Email Notification System

## Overview
Complete implementation of real-time Gmail inbox monitoring with instant notifications when new emails arrive.

## Features Implemented

### 1. **Gmail API Integration** (`src/services/gmailFetchService.ts`)
- Automatic access token refresh
- Email fetching with full metadata (from, subject, body, timestamp)
- Support for both plain text and HTML emails
- Base64url decoding for email content

### 2. **Email Polling Service** (`src/services/emailPollingService.ts`)
- Real-time monitoring with 30-second intervals
- Deduplication to ensure 1-time-only notifications
- Automatic polling resume on bot restart
- Fallback to plain text if embed fails

### 3. **Gmail Push Notifications** (`src/services/gmailPushService.ts`)
- Google Cloud Pub/Sub integration for instant notifications (< 5 seconds)
- Gmail API watch endpoint setup
- Webhook handler for push events
- Automatic watch renewal support

### 4. **Button Interaction** (`src/handlers/buttonClick.ts`)
- Click "View Full Email" button to expand content
- HTML tag stripping for clean text display
- Content truncation for long emails
- Error handling with user feedback

### 5. **Subscription Management** (`src/commands/subscribe.ts`)
- `*subscribe` - Enable email notifications
- `*unsubscribe` - Disable email notifications
- `*status` - Check subscription and OAuth status

### 6. **Automatic Setup on Login** (`src/server/oauthCallback.ts`)
- Auto-creates subscription when user logs in
- Attempts Gmail Push setup first (requires Pub/Sub)
- Falls back to 30-second polling
- Starts monitoring immediately after OAuth

## User Flow

1. **Login**: User sends `*login` command
2. **Authorize**: User clicks OAuth link and authorizes Gmail access
3. **Auto-Subscribe**: Bot automatically creates subscription and starts monitoring
4. **Receive Notifications**: When new email arrives:
   - Bot sends notification with preview (from, subject, snippet)
   - Shows "View Full Email" button
5. **View Full Email**: User clicks button to see complete email content

## Commands

- `*login` - Connect Gmail account
- `*subscribe` - Enable email notifications (auto-enabled on login)
- `*unsubscribe` - Disable email notifications
- `*status` - Check subscription status
- `*logout` - Disconnect Gmail account
- `*help` - Show all commands

## Technical Details

### Notification Frequency
- **With Gmail Push** (requires Google Cloud Pub/Sub): < 5 seconds
- **With Polling Only**: 30 seconds (configurable)

### Deduplication
- Tracks last message ID per user
- Only sends notification once per email
- Persists across bot restarts via database

### Error Handling
- Graceful fallback from embed to plain text
- Token auto-refresh on expiration
- Comprehensive error logging
- User-friendly error messages

### Database Schema (Prisma)
```prisma
model User {
  id            String         @id @default(cuid())
  botUserId     String         @unique
  email         String?
  provider      String
  oauthToken    OAuthToken?
  subscriptions Subscription[]
}

model Subscription {
  id          String   @id @default(cuid())
  userId      String
  alertType   String   @default("new_email")
  isActive    Boolean  @default(true)
}
```

## Setup Requirements

### Required Environment Variables
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
OAUTH_REDIRECT_URI=http://localhost:3000/oauth/callback
```

### Optional (For Push Notifications)
```env
GOOGLE_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-push
```

### Gmail API Scopes Required
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.modify` (for watch)
- `https://www.googleapis.com/auth/userinfo.email`

## Gmail Push Setup (Optional but Recommended)

### 1. Enable Pub/Sub API
```bash
gcloud services enable pubsub.googleapis.com
```

### 2. Create Pub/Sub Topic
```bash
gcloud pubsub topics create gmail-push
```

### 3. Grant Gmail Permissions
```bash
gcloud pubsub topics add-iam-policy-binding gmail-push \
  --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
  --role=roles/pubsub.publisher
```

### 4. Create Push Subscription
```bash
gcloud pubsub subscriptions create gmail-push-sub \
  --topic=gmail-push \
  --push-endpoint=https://your-domain.com/webhooks/gmail
```

### 5. Set Environment Variable
```env
GOOGLE_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-push
```

## Webhook Endpoint

The bot exposes a webhook endpoint for Gmail Push notifications:
- **URL**: `POST /webhooks/gmail`
- **Purpose**: Receives push notifications from Google Pub/Sub
- **Response**: Immediate 200 OK (async processing)

## Files Created/Modified

### New Files
1. `src/services/gmailFetchService.ts` - Gmail API integration
2. `src/services/emailPollingService.ts` - Polling service
3. `src/services/gmailPushService.ts` - Push notification service
4. `src/commands/subscribe.ts` - Subscription management

### Modified Files
1. `src/handlers/buttonClick.ts` - Added email view button handler
2. `src/server/oauthCallback.ts` - Added auto-subscription and monitoring
3. `src/server/index.ts` - Added webhook endpoint
4. `src/commands/index.ts` - Registered new commands
5. `src/commands/help.ts` - Updated help text
6. `src/index.ts` - Added polling resume on startup
7. `src/config/env.ts` - Added Pub/Sub topic config

## Testing

1. Start the bot: `npm run dev`
2. Send `*login` to bot in DM
3. Click OAuth link and authorize
4. Bot confirms connection and starts monitoring
5. Send a test email to your Gmail
6. Within 30 seconds (or < 5s with Push), receive notification
7. Click "View Full Email" button
8. See full email content

## Monitoring & Logs

All operations are logged with context:
- Email fetching attempts
- Notification delivery
- Polling status
- Push notification events
- Subscription changes
- Error conditions

## Performance

- **Polling**: Minimal resource usage, checks every 30 seconds
- **Push**: Zero polling overhead, instant notifications
- **Deduplication**: O(1) lookup via Map
- **Database**: Indexed queries on botUserId

## Security

- OAuth tokens stored encrypted in database
- Automatic token refresh before expiration
- State token validation in OAuth flow
- No email content stored (fetched on demand)

## Future Enhancements

1. Keyword filtering for selective notifications
2. Email threading support
3. Attachment detection and preview
4. Multiple email account support
5. Redis cache for distributed deployments
6. Email read/unread status tracking
