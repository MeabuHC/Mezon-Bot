import type { MezonClient } from "mezon-sdk";
import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";
import { stopEmailPolling, startEmailPolling } from "../services/emailPollingService.js";
import { sendDMWithRetry } from "../utils/sendDM.js";

const prisma = new PrismaClient();

/**
 * Subscribe command - Enable email notifications
 */
export async function handleSubscribe(botUserId: string, channelId: string, client: MezonClient): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { subscriptions: true },
    });

    if (!user) {
      const targetUser = await client.users.fetch(botUserId);
      if (targetUser) {
        await sendDMWithRetry(
          targetUser,
          "❌ You need to login first. Use `*login` to connect your Gmail account."
        );
      }
      return;
    }

    const existingSub = user.subscriptions.find(
      (sub) => sub.alertType === "new_email" && sub.isActive
    );

    if (existingSub) {
      const targetUser = await client.users.fetch(botUserId);
      if (targetUser) {
        await sendDMWithRetry(targetUser, "✅ You are already subscribed to email notifications.");
      }
      return;
    }

    if (user.subscriptions.length > 0) {
      await prisma.subscription.updateMany({
        where: { userId: user.id, alertType: "new_email" },
        data: { isActive: true },
      });
    } else {
      await prisma.subscription.create({ data: { userId: user.id, alertType: "new_email", includePatterns: [], excludePatterns: [], isActive: true } as any });
    }

    // Start email polling
    await startEmailPolling(client, botUserId, 0.167);

    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(
        targetUser,
        "✅ Successfully subscribed to email notifications! You'll receive alerts when new emails arrive."
      );
    }

    logInfo("User subscribed to email notifications", { botUserId });
  } catch (error) {
    logWarn("Failed to subscribe user", { error, botUserId });
    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(targetUser, "❌ Failed to subscribe. Please try again later.");
    }
  }
}

/**
 * Unsubscribe command - Disable email notifications
 */
export async function handleUnsubscribe(botUserId: string, channelId: string, client: MezonClient): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { subscriptions: true },
    });

    if (!user || user.subscriptions.length === 0) {
      const targetUser = await client.users.fetch(botUserId);
      if (targetUser) {
        await sendDMWithRetry(targetUser, "ℹ️ You don't have any active subscriptions.");
      }
      return;
    }

    // Deactivate all subscriptions
    await prisma.subscription.updateMany({
      where: { userId: user.id },
      data: { isActive: false },
    });

    // Stop email polling
    stopEmailPolling(botUserId);

    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(targetUser, "✅ Successfully unsubscribed from email notifications.");
    }

    logInfo("User unsubscribed from email notifications", { botUserId });
  } catch (error) {
    logWarn("Failed to unsubscribe user", { error, botUserId });
    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(targetUser, "❌ Failed to unsubscribe. Please try again later.");
    }
  }
}

/**
 * Subscription status command
 */
export async function handleSubscriptionStatus(botUserId: string, channelId: string, client: MezonClient): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: {
        subscriptions: true,
        oauthToken: true,
      },
    });

    if (!user) {
      const targetUser = await client.users.fetch(botUserId);
      if (targetUser) {
        await sendDMWithRetry(targetUser, "ℹ️ You are not logged in. Use `*login` to connect your Gmail account.");
      }
      return;
    }

    const activeSubs = user.subscriptions.filter((sub) => sub.isActive);
    const hasOAuth = !!user.oauthToken;

    let statusMessage = `📊 **Subscription Status**\n\n`;
    statusMessage += `**Account:** ${user.email || "Not available"}\n`;
    statusMessage += `**OAuth:** ${hasOAuth ? "✅ Connected" : "❌ Not connected"}\n`;
    statusMessage += `**Email Notifications:** ${activeSubs.length > 0 ? "✅ Active" : "❌ Inactive"}\n\n`;

    if (activeSubs.length > 0) {
      statusMessage += `Use \`*unsubscribe\` to disable notifications.`;
    } else {
      statusMessage += `Use \`*subscribe\` to enable notifications.`;
    }

    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(targetUser, statusMessage);
    }
  } catch (error) {
    logWarn("Failed to get subscription status", { error, botUserId });
    const targetUser = await client.users.fetch(botUserId);
    if (targetUser) {
      await sendDMWithRetry(targetUser, "❌ Failed to retrieve subscription status.");
    }
  }
}
