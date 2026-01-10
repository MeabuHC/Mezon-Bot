import { PrismaClient } from "@prisma/client";
import type { MezonClient } from "mezon-sdk";
import { fetchRecentEmails } from "./gmailFetchService.js";
import { logInfo, logWarn, logError } from "../logger.js";
import { InteractiveBuilder, EMessageComponentType, EButtonMessageStyle } from "mezon-sdk";
import { cacheEmail } from "../utils/emailCache.js";

/**
 * Extract sender name from email "From" header
 */
function extractSenderName(fromHeader: string): string {
  if (!fromHeader) return "Unknown sender";
  // If there's a display name part before the email, use that
  const angleIndex = fromHeader.indexOf("<");
  let display = fromHeader;
  if (angleIndex > 0) {
    display = fromHeader.slice(0, angleIndex).trim() || fromHeader;
  }

  // Strip surrounding quotes if present
  if (
    (display.startsWith('"') && display.endsWith('"')) ||
    (display.startsWith("'") && display.endsWith("'"))
  ) {
    display = display.slice(1, -1);
  }

  // Strip angle brackets if the whole thing is wrapped like <mbebanking@bank.com>
  display = display.replace(/[<>]/g, "").trim();

  // If it's still just an email address, prettify it (take local part)
  if (display.includes("@")) {
    const localPart = display.split("@")[0];
    display = localPart
      .replace(/[._]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return display || "Unknown sender";
}

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
    body: string;
    timestamp: number;
  }
): Promise<void> {
  try {
    // Cache email for button handler
    cacheEmail(email);
    logInfo("Email cached", { emailId: email.id, from: email.from, subject: email.subject });

    const user = await client.users.fetch(botUserId);
    if (!user) {
      logWarn("User not found", { botUserId });
      return;
    }

    const timestamp = new Date(email.timestamp).toLocaleString();

    // Format subject (truncate if too long, like inbox command)
    const subject = email.subject.length > 60
      ? email.subject.slice(0, 57) + "..."
      : email.subject;

    // Extract sender name (like inbox command)
    const sender = extractSenderName(email.from);

    // Format preview (truncate if too long)
    const preview = email.snippet.length > 200
      ? email.snippet.substring(0, 197) + "..."
      : email.snippet;

    // Create embed with email preview
    const embed = new InteractiveBuilder("📧 New Email Received")
      .addField("From", sender, false)
      .addField("Subject", subject, false)
      .addField("Preview", preview || "(no preview)", false)
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
        `**From:** ${sender}\n` +
        `**Subject:** ${subject}\n` +
        `**Preview:** ${preview || "(no preview)"}\n` +
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
        // Evaluate per-user subscription filters (include/exclude on `from`)
        const user = await prisma.user.findUnique({
          where: { botUserId },
          include: { subscriptions: { where: { isActive: true } } },
        });

        let allowed = true;
        if (user && user.subscriptions.length > 0) {
          // If any subscription explicitly allows the email, allow it.
          // Otherwise, deny when an exclude pattern matches.
          allowed = false;
          for (const sub of user.subscriptions) {
            const s: any = sub;
            const includes: string[] = s.includePatterns || [];
            const excludes: string[] = s.excludePatterns || [];

            // If include patterns exist, require at least one to match
            if (includes.length > 0) {
              for (const p of includes) {
                try {
                  const re = new RegExp(p, "i");
                  if (re.test(latestEmail.from)) {
                    // ensure no exclude matches
                    let excluded = false;
                    for (const ep of excludes) {
                      try {
                        const ere = new RegExp(ep, "i");
                        if (ere.test(latestEmail.from)) {
                          excluded = true;
                          break;
                        }
                      } catch (e) {
                        logWarn("Invalid exclude regex", { pattern: ep, error: e });
                      }
                    }
                    if (!excluded) {
                      allowed = true;
                      break;
                    }
                  }
                } catch (e) {
                  logWarn("Invalid include regex", { pattern: p, error: e });
                }
              }
            } else {
              // No include patterns: allowed unless excluded
              let excluded = false;
              for (const ep of excludes) {
                try {
                  const ere = new RegExp(ep, "i");
                  if (ere.test(latestEmail.from)) {
                    excluded = true;
                    break;
                  }
                } catch (e) {
                  logWarn("Invalid exclude regex", { pattern: ep, error: e });
                }
              }
              if (!excluded) {
                allowed = true;
                break;
              }
            }
          }
        }

        if (allowed) {
          await sendEmailNotification(client, botUserId, latestEmail);
        } else {
          logInfo("Email skipped by user filters", { botUserId, emailId: latestEmail.id, from: latestEmail.from });
        }
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
