import { PrismaClient } from "@prisma/client";
import type { MezonClient } from "mezon-sdk";
import { fetchRecentEmails } from "./gmailFetchService.js";
import { logInfo, logWarn, logError } from "../logger.js";
import { InteractiveBuilder, EMessageComponentType, EButtonMessageStyle } from "mezon-sdk";

const prisma = new PrismaClient();
const pollingIntervals = new Map<string, NodeJS.Timeout>();
const lastMessageIds = new Map<string, string>();

/**
 * Send email notification to user
 */
async function sendEmailNotification(
  client: MezonClient,
  botUserId: string,
  email: {
    id: string;
    from: string;
    subject: string;
    snippet: string;
    timestamp: number;
  }
): Promise<void> {
  try {
    const user = await client.users.fetch(botUserId);
    if (!user) {
      logWarn("User not found", { botUserId });
      return;
    }

    const timestamp = new Date(email.timestamp).toLocaleString();
    
    // Create embed with email preview
    const embed = new InteractiveBuilder("📧 New Email Received")
      .addField("From", email.from, false)
      .addField("Subject", email.subject, false)
      .addField("Preview", email.snippet.substring(0, 200) + (email.snippet.length > 200 ? "..." : ""), false)
      .addField("Time", timestamp, false)
      .build();

    const components = [
      {
        components: [
          {
            id: `email_view_${email.id}`,
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
      // Try sending with embed first
      await user.sendDM({
        embed: [embed],
        components,
      });
    } catch (embedError) {
      // Fallback to plain text if embed fails
      logWarn("Failed to send email notification with embed, falling back to plain text", {
        botUserId,
        error: embedError,
      });
      
      const plainMessage = `📧 **New Email Received**\n\n` +
        `**From:** ${email.from}\n` +
        `**Subject:** ${email.subject}\n` +
        `**Preview:** ${email.snippet.substring(0, 200)}${email.snippet.length > 200 ? "..." : ""}\n` +
        `**Time:** ${timestamp}\n\n` +
        `Use the View button to see the full email.`;
      
      await user.sendDM({ t: plainMessage });
    }

    logInfo("Email notification sent", { botUserId, emailId: email.id });
  } catch (error) {
    logError("Failed to send email notification", { error, botUserId });
  }
}

/**
 * Check for new emails and notify user
 */
async function checkNewEmails(
  client: MezonClient,
  botUserId: string
): Promise<void> {
  try {
    const emails = await fetchRecentEmails(botUserId, 1);
    
    if (emails.length === 0) {
      return;
    }

    const latestEmail = emails[0];
    const lastMessageId = lastMessageIds.get(botUserId);

    // Only send notification if this is a new email
    if (!lastMessageId || lastMessageId !== latestEmail.id) {
      lastMessageIds.set(botUserId, latestEmail.id);
      
      // Only send notification if this is not the first check
      if (lastMessageId) {
        await sendEmailNotification(client, botUserId, latestEmail);
      }
    }
  } catch (error) {
    logError("Error checking new emails", { error, botUserId });
  }
}

/**
 * Start email polling for a user
 */
export async function startEmailPolling(
  client: MezonClient,
  botUserId: string,
  intervalMinutes: number = 0.167 // 10 seconds by default
): Promise<void> {
  // Stop existing polling if any
  stopEmailPolling(botUserId);

  try {
    // Check if user has active subscription
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: {
        subscriptions: {
          where: { isActive: true },
        },
      },
    });

    if (!user || user.subscriptions.length === 0) {
      logInfo("No active subscription for user, skipping polling", { botUserId });
      return;
    }

    // Initialize with current latest email (don't send notification)
    const emails = await fetchRecentEmails(botUserId, 1);
    if (emails.length > 0) {
      lastMessageIds.set(botUserId, emails[0].id);
    }

    // Start polling
    const intervalMs = intervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      checkNewEmails(client, botUserId).catch((error) => {
        logError("Error in polling interval", { error, botUserId });
      });
    }, intervalMs);

    pollingIntervals.set(botUserId, interval);
    logInfo("Started email polling", { botUserId, intervalMinutes });
  } catch (error) {
    logError("Failed to start email polling", { error, botUserId });
  }
}

/**
 * Stop email polling for a user
 */
export function stopEmailPolling(botUserId: string): void {
  const interval = pollingIntervals.get(botUserId);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(botUserId);
    lastMessageIds.delete(botUserId);
    logInfo("Stopped email polling", { botUserId });
  }
}

/**
 * Resume polling for all active subscriptions
 */
export async function resumeAllPolling(client: MezonClient): Promise<void> {
  try {
    const activeSubscriptions = await prisma.subscription.findMany({
      where: { isActive: true },
      include: { user: true },
    });

    for (const subscription of activeSubscriptions) {
      await startEmailPolling(client, subscription.user.botUserId, 0.167);
    }

    logInfo("Resumed email polling for all active subscriptions", {
      count: activeSubscriptions.length,
    });
  } catch (error) {
    logError("Failed to resume all polling", { error });
  }
}
