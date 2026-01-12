import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder } from "mezon-sdk";
import { PrismaClient } from "@prisma/client";
import { sendDMWithRetry } from "../utils/sendDM.js";
import { getImportantGmailLabelCounts } from "../services/gmailService.js";

const prisma = new PrismaClient();

export const runStatus: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);

    if (!user) {
      logWarn("Could not resolve user for status command", { sender: event.sender_id });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { botUserId: event.sender_id },
      include: {
        oauthToken: true,
        subscriptions: {
          where: { isActive: true },
        },
      },
    });

    if (!dbUser || !dbUser.oauthToken) {
      const embed = new InteractiveBuilder("❌ Not Connected")
        .setDescription("You don't have a Gmail account connected.")
        .addField("Connect your account", "Run `*login` to connect your Gmail account.", false)
        .build();

      await user.sendDM({ embed: [embed] });
      logInfo("User checked status - not connected", { sender_id: event.sender_id });
      return;
    }

    // Format connection date
    const connectedDate = new Date(dbUser.createdAt);
    const connectedDateStr = connectedDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const embedBuilder = new InteractiveBuilder("📊 Connection Status")
      .setDescription("Your Gmail account connection information");

    if (dbUser.picture) {
      embedBuilder.setThumbnail(dbUser.picture);
    }

    // Account information
    if (dbUser.email) {
      embedBuilder.addField("📧 Email", dbUser.email, false);
    }

    if (dbUser.name) {
      embedBuilder.addField("👤 Name", dbUser.name, false);
    }

    // Connection date
    embedBuilder.addField("🔗 Connected", connectedDateStr, false);

    // Permissions/Scopes - show only non-default, meaningful permissions
    if (dbUser.oauthToken.scope) {
      const scopes = dbUser.oauthToken.scope.split(" ").filter((s) => s);

      // Filter out default/always-present scopes
      const defaultScopes = ["openid", "https://www.googleapis.com/auth/userinfo.email"];
      const meaningfulScopes = scopes.filter((scope) => !defaultScopes.includes(scope));

      if (meaningfulScopes.length > 0) {
        // Map scope URLs to user-friendly names
        const scopeNames: Record<string, string> = {
          "https://www.googleapis.com/auth/gmail.readonly": "Read Gmail",
          "https://www.googleapis.com/auth/gmail.send": "Send Emails",
          "https://www.googleapis.com/auth/gmail.modify": "Modify Gmail",
          "https://www.googleapis.com/auth/gmail.compose": "Compose Emails",
        };

        const friendlyScopes = meaningfulScopes
          .map((scope) => scopeNames[scope] || scope)
          .filter((s) => s) // Remove empty strings
          .join(", ");

        if (friendlyScopes) {
          embedBuilder.addField("🔐 Permissions", friendlyScopes, false);
        }
      }
    }

    const labelCounts = await getImportantGmailLabelCounts(event.sender_id);
    if (labelCounts && Object.keys(labelCounts).length > 0) {
      // Define label mapping with emojis and friendly names
      const labelMap: Record<string, { emoji: string; name: string }> = {
        "INBOX": { emoji: "📥", name: "Inbox" },
        "CATEGORY_PERSONAL": { emoji: "📬", name: "Primary" },
        "CATEGORY_SOCIAL": { emoji: "👥", name: "Social" },
        "CATEGORY_PROMOTIONS": { emoji: "🎁", name: "Promotions" },
        "CATEGORY_UPDATES": { emoji: "📢", name: "Updates" },
        "CATEGORY_FORUMS": { emoji: "💬", name: "Forums" },
        "SENT": { emoji: "📤", name: "Sent" },
        "DRAFT": { emoji: "📝", name: "Draft" },
        "STARRED": { emoji: "⭐", name: "Starred" },
        "SPAM": { emoji: "🚫", name: "Spam" },
        "TRASH": { emoji: "🗑️", name: "Trash" },
      };

      // Define preferred order for display
      const labelOrder = [
        "INBOX",
        "CATEGORY_PERSONAL",
        "CATEGORY_SOCIAL",
        "CATEGORY_PROMOTIONS",
        "CATEGORY_UPDATES",
        "CATEGORY_FORUMS",
        "SENT",
        "DRAFT",
        "STARRED",
        "SPAM",
        "TRASH",
      ];

      // Helper function to format label value
      // Some labels don't have "unread" concept (Starred, Trash, Sent, Draft)
      const formatLabelValue = (labelKey: string, label: { total: number; unread: number }): string => {
        const noUnreadLabels = ["STARRED", "TRASH", "SENT", "DRAFT"];
        if (noUnreadLabels.includes(labelKey)) {
          // Just show total for labels that don't have unread concept
          return `Total: ${label.total.toLocaleString()}`;
        } else {
          // Show unread and total for labels that make sense
          return `Unread: ${label.unread.toLocaleString()} / Total: ${label.total.toLocaleString()}`;
        }
      };

      // Helper function to add a field if label exists
      const addFieldIfExists = (labelKey: string, isInline: boolean) => {
        if (labelCounts[labelKey]) {
          const label = labelCounts[labelKey];
          const labelInfo = labelMap[labelKey] || { emoji: "📧", name: labelKey };
          const value = formatLabelValue(labelKey, label);
          embedBuilder.addField(`${labelInfo.emoji} ${labelInfo.name}`, value, isInline);
        }
      };

      // Row 1: Inbox, Primary, Social (3 inline fields)
      addFieldIfExists("INBOX", true);
      addFieldIfExists("CATEGORY_PERSONAL", true);
      addFieldIfExists("CATEGORY_SOCIAL", true);

      addFieldIfExists("CATEGORY_PROMOTIONS", true);
      addFieldIfExists("CATEGORY_UPDATES", true);
      addFieldIfExists("CATEGORY_FORUMS", true);

      // Row 3: Sent, Draft, Spam (3 inline fields)
      addFieldIfExists("SENT", true);
      addFieldIfExists("DRAFT", true);
      addFieldIfExists("SPAM", true);

      // Row 4: Starred, Trash (2 inline fields - these don't need a 3rd)
      addFieldIfExists("STARRED", true);
      addFieldIfExists("TRASH", true);

      // Also show any other labels that might exist but aren't in our predefined list
      for (const labelKey of Object.keys(labelCounts)) {
        if (!labelOrder.includes(labelKey)) {
          const label = labelCounts[labelKey];
          const value = formatLabelValue(labelKey, label);

          // Use friendly name if available, otherwise use the key
          const friendlyName = labelKey.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
          embedBuilder.addField(`📧 ${friendlyName}`, value, true);
        }
      }
    } else {
      // If no counts available, show a message
      embedBuilder.addField("📬 Email Counts", "Unable to fetch email counts. Please try again later.", false);
    }

    await user.sendDM({ embed: [embedBuilder.build()] });

    logInfo("User checked status", {
      sender_id: event.sender_id,
      email: dbUser.email,
    });
  } catch (error) {
    logWarn("Failed to execute status command", {
      error,
      sender_id: event.sender_id,
    });
    try {
      const user = await client.users.fetch(event.sender_id);
      if (user) {
        await sendDMWithRetry(
          user,
          "❌ Failed to retrieve status. Please try again later."
        );
      }
    } catch (sendError) {
      logWarn("Failed to send error message for status command", { error: sendError });
    }
  }
};


