import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn, logError } from "../logger.js";
import { env } from "../config/env.js";
import { fetchRecentEmails } from "./gmailFetchService.js";
import type { MezonClient } from "mezon-sdk";
import { InteractiveBuilder, EMessageComponentType, EButtonMessageStyle } from "mezon-sdk";

const prisma = new PrismaClient();
const lastNotifiedIds = new Map<string, string>();

/**
 * Setup Gmail Push Notifications using Gmail API watch
 * Requires Google Cloud Pub/Sub topic configuration
 */
export async function setupGmailWatch(botUserId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user?.oauthToken) {
      logWarn("No OAuth token for Gmail watch setup", { botUserId });
      return false;
    }

    // Gmail watch requires a Pub/Sub topic
    // Format: projects/{project-id}/topics/{topic-name}
    const topicName = env.googlePubsubTopic || "projects/YOUR_PROJECT_ID/topics/gmail-push";

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/watch",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.oauthToken.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          topicName,
          labelIds: ["INBOX"],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      logWarn("Failed to setup Gmail watch", {
        status: response.status,
        error,
        botUserId,
      });
      return false;
    }

    const data = await response.json();
    logInfo("Gmail watch setup successful", {
      botUserId,
      historyId: data.historyId,
      expiration: data.expiration,
    });

    return true;
  } catch (error) {
    logError("Error setting up Gmail watch", { error, botUserId });
    return false;
  }
}

/**
 * Stop Gmail Push Notifications
 */
export async function stopGmailWatch(botUserId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user?.oauthToken) {
      return false;
    }

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/stop",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.oauthToken.accessToken}`,
        },
      }
    );

    if (response.ok) {
      logInfo("Gmail watch stopped", { botUserId });
      return true;
    }

    return false;
  } catch (error) {
    logError("Error stopping Gmail watch", { error, botUserId });
    return false;
  }
}

/**
 * Handle Gmail Push Notification from Pub/Sub webhook
 */
export async function handleGmailPushNotification(
  client: MezonClient,
  data: { emailAddress: string; historyId: string }
): Promise<void> {
  try {
    // Find user by email
    const user = await prisma.user.findFirst({
      where: { email: data.emailAddress },
      include: {
        subscriptions: {
          where: { isActive: true },
        },
      },
    });

    if (!user || user.subscriptions.length === 0) {
      logWarn("No active subscription for email", { email: data.emailAddress });
      return;
    }

    // Fetch latest email
    const emails = await fetchRecentEmails(user.botUserId, 1);
    if (emails.length === 0) {
      return;
    }

    const latestEmail = emails[0];
    const lastId = lastNotifiedIds.get(user.botUserId);

    // Only notify if this is a new email
    if (lastId !== latestEmail.id) {
      lastNotifiedIds.set(user.botUserId, latestEmail.id);

      const botUser = await client.users.fetch(user.botUserId);
      if (!botUser) {
        logWarn("Bot user not found", { botUserId: user.botUserId });
        return;
      }

      const timestamp = new Date(latestEmail.timestamp).toLocaleString();

      // Create embed notification
      const embed = new InteractiveBuilder("📧 New Email Received")
        .addField("From", latestEmail.from, false)
        .addField("Subject", latestEmail.subject, false)
        .addField("Preview", latestEmail.snippet.substring(0, 200) + (latestEmail.snippet.length > 200 ? "..." : ""), false)
        .addField("Time", timestamp, false)
        .build();

      const components = [
        {
          components: [
            {
              id: `email_view_${latestEmail.id}`,
              type: EMessageComponentType.BUTTON,
              component: {
                label: "View Full Email",
                style: EButtonMessageStyle.PRIMARY,
              },
            },
          ],
        },
      ];

      try {
        await botUser.sendDM({
          embed: [embed],
          components,
        });
      } catch (embedError) {
        // Fallback to plain text
        const plainMessage = `📧 **New Email Received**\n\n` +
          `**From:** ${latestEmail.from}\n` +
          `**Subject:** ${latestEmail.subject}\n` +
          `**Preview:** ${latestEmail.snippet.substring(0, 200)}${latestEmail.snippet.length > 200 ? "..." : ""}\n` +
          `**Time:** ${timestamp}`;
        
        await botUser.sendDM({ t: plainMessage });
      }

      logInfo("Push notification sent for new email", {
        botUserId: user.botUserId,
        emailId: latestEmail.id,
      });
    }
  } catch (error) {
    logError("Error handling Gmail push notification", { error });
  }
}

/**
 * Renew Gmail watch (should be called before expiration, typically every 7 days)
 */
export async function renewGmailWatch(botUserId: string): Promise<boolean> {
  return await setupGmailWatch(botUserId);
}
