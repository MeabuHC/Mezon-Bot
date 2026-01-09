import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn, logError } from "../logger.js";
import { env } from "../config/env.js";

const prisma = new PrismaClient();

interface EmailData {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  timestamp: number;
  labels: string[];
}

/**
 * Refresh an expired access token using the refresh token
 */
async function refreshAccessToken(botUserId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user?.oauthToken?.refreshToken) {
      logWarn("No refresh token available", { botUserId });
      return null;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: user.oauthToken.refreshToken,
        client_id: env.googleClientId!,
        client_secret: env.googleClientSecret!,
      }),
    });

    if (!response.ok) {
      logError("Failed to refresh access token", { 
        status: response.status,
        botUserId 
      });
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.oAuthToken.update({
      where: { userId: user.id },
      data: {
        accessToken: newAccessToken,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    logInfo("Access token refreshed", { botUserId });
    return newAccessToken;
  } catch (error) {
    logError("Error refreshing access token", { error, botUserId });
    return null;
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
async function getValidAccessToken(botUserId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user?.oauthToken) {
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(user.oauthToken.expiresAt);
    
    // Refresh if token expires within 5 minutes
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      return await refreshAccessToken(botUserId);
    }

    return user.oauthToken.accessToken;
  } catch (error) {
    logError("Error getting valid access token", { error, botUserId });
    return null;
  }
}

/**
 * Parse email data from Gmail API message
 */
function parseEmailData(message: any): EmailData {
  const headers = message.payload?.headers || [];
  const from = headers.find((h: any) => h.name.toLowerCase() === "from")?.value || "Unknown";
  const subject = headers.find((h: any) => h.name.toLowerCase() === "subject")?.value || "(No Subject)";
  
  let body = "";
  
  // Extract body from payload
  if (message.payload?.body?.data) {
    body = Buffer.from(message.payload.body.data, "base64url").toString("utf-8");
  } else if (message.payload?.parts) {
    for (const part of message.payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        body = Buffer.from(part.body.data, "base64url").toString("utf-8");
        break;
      }
    }
    // Fallback to HTML if no plain text
    if (!body) {
      for (const part of message.payload.parts) {
        if (part.mimeType === "text/html" && part.body?.data) {
          body = Buffer.from(part.body.data, "base64url").toString("utf-8");
          break;
        }
      }
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    from,
    subject,
    snippet: message.snippet || "",
    body: body || message.snippet || "",
    timestamp: parseInt(message.internalDate) || Date.now(),
    labels: message.labelIds || [],
  };
}

/**
 * Fetch recent emails from Gmail
 */
export async function fetchRecentEmails(
  botUserId: string,
  maxResults: number = 5
): Promise<EmailData[]> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No valid access token for fetching emails", { botUserId });
      return [];
    }

    // Fetch message list
    const listResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&labelIds=INBOX`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!listResponse.ok) {
      logError("Failed to fetch email list", {
        status: listResponse.status,
        botUserId,
      });
      return [];
    }

    const listData = await listResponse.json();
    const messages = listData.messages || [];

    if (messages.length === 0) {
      return [];
    }

    // Fetch full message details
    const emailPromises = messages.map(async (msg: any) => {
      const msgResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!msgResponse.ok) {
        logWarn("Failed to fetch message details", {
          messageId: msg.id,
          status: msgResponse.status,
        });
        return null;
      }

      const msgData = await msgResponse.json();
      return parseEmailData(msgData);
    });

    const emails = await Promise.all(emailPromises);
    return emails.filter((email): email is EmailData => email !== null);
  } catch (error) {
    logError("Error fetching recent emails", { error, botUserId });
    return [];
  }
}

/**
 * Fetch a single email by ID
 */
export async function fetchEmailById(
  botUserId: string,
  messageId: string
): Promise<EmailData | null> {
  try {
    logInfo("fetchEmailById called", { botUserId, messageId });
    
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No access token for fetchEmailById", { botUserId });
      return null;
    }

    logInfo("Calling Gmail API for message", { messageId });
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    logInfo("Gmail API response", { 
      messageId, 
      status: response.status, 
      ok: response.ok 
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError("Failed to fetch email", {
        messageId,
        status: response.status,
        botUserId,
        error: errorText,
      });
      return null;
    }

    const msgData = await response.json();
    return parseEmailData(msgData);
  } catch (error) {
    logError("Error fetching email by ID", { error, messageId, botUserId });
    return null;
  }
}
