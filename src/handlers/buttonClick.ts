import { logInfo, logWarn, logError } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";
import {
  fetchEmailById,
  type EmailData,
} from "../services/gmailFetchService.js";
import { getCachedEmail, type CachedEmail } from "../utils/emailCache.js";
import { showInboxPage } from "../commands/inbox.js";
import {
  SEND_MAIL_BUTTON_ID_PREFIX,
  CANCEL_SEND_MAIL_BUTTON_ID_PREFIX,
} from "../commands/sendMail.js";
import { sendUserEmail } from "../services/emailService.js";

// Deduplicate rapid duplicate button events (in-memory)
const processedButtonClicks = new Set<string>();
const BUTTON_CLICK_TTL_MS = 3000; // ignore duplicates within 3s

setInterval(() => {
  processedButtonClicks.clear();
}, BUTTON_CLICK_TTL_MS);

export async function handleButtonClick(
  client: MezonClient,
  event: MessageButtonClicked
): Promise<void> {
  logInfo("Button clicked", {
    button_id: event.button_id,
    sender_id: event.sender_id,
    channel_id: event.channel_id,
  });

  // Basic dedupe: ignore rapid duplicate clicks from same user for same button
  try {
    const clickKey = `${event.button_id}:${event.user_id || event.sender_id}`;
    if (processedButtonClicks.has(clickKey)) {
      logInfo("Ignoring duplicate button click", { button_id: event.button_id, user: event.user_id || event.sender_id });
      return;
    }
    processedButtonClicks.add(clickKey);
  } catch (e) {
    // ignore problems with dedupe
  }

  if (event.button_id.startsWith("oauth_login_")) {
    try {
      const user = await client.users.fetch(event.sender_id);
      if (!user) {
        logWarn("Could not resolve user for OAuth button", {
          sender: event.sender_id,
        });
        return;
      }

      if (!env.googleClientId || !env.oauthRedirectUri) {
        await user.sendDM({
          t: "❌ OAuth is not configured. Please contact support.",
        });
        return;
      }

      const oauthUrl = generateGmailOAuthUrl(
        event.sender_id,
        env.oauthRedirectUri,
        env.googleClientId
      );

      await user.sendDM({
        t: `🔗 **Click this link to authorize:**\n\n${oauthUrl}`,
      });

      logInfo("Sent OAuth URL via button click", {
        channel_id: event.channel_id,
        sender_id: event.sender_id,
      });
    } catch (error) {
      logWarn("Failed to handle OAuth button click", {
        error,
        channel_id: event.channel_id,
      });
    }
    return;
  }

  // Handle email view button clicks
  if (event.button_id.startsWith("email_view_")) {
    logInfo("Email view button clicked", {
      button_id: event.button_id,
      sender_id: event.sender_id,
    });

    try {
      const messageId = event.button_id.replace("email_view_", "");
      logInfo("Extracted message ID", {
        messageId,
        botUserId: event.sender_id,
      });

      const user = await client.users.fetch(event.sender_id);

      if (!user) {
        logWarn("Could not resolve user for email view", {
          sender: event.sender_id,
        });
        return;
      }

      logInfo("Fetching email from Gmail", {
        messageId,
        botUserId: event.sender_id,
      });

      // Check cache first
      let email: CachedEmail | EmailData | null = getCachedEmail(messageId);

      if (!email) {
        logInfo("Email not in cache, fetching from Gmail API", { messageId });
        email = await fetchEmailById(event.sender_id, messageId);
      } else {
        logInfo("Email found in cache", { messageId });
      }

      if (!email) {
        logWarn("Email not found", { messageId, botUserId: event.sender_id });
        await user.sendDM({
          t: "❌ Unable to fetch email. It may have been deleted or moved.",
        });
        return;
      }

      logInfo("Email fetched successfully", {
        messageId,
        from: email.from,
        subject: email.subject,
      });

      if (!email) {
        await user.sendDM({
          t: "❌ Unable to fetch email. It may have been deleted or moved.",
        });
        return;
      }

      // Clean up HTML tags and format body
      let cleanBody = email.body
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
        .trim();

      // Limit body length
      if (cleanBody.length > 1500) {
        cleanBody =
          cleanBody.substring(0, 1500) + "\n\n... (content truncated)";
      }

      const fullMessage =
        `📧 **Full Email**\n\n` +
        `**From:** ${email.from}\n` +
        `**Subject:** ${email.subject}\n` +
        `**Time:** ${new Date(email.timestamp).toLocaleString()}\n\n` +
        `**Content:**\n${cleanBody}`;

      await user.sendDM({ t: fullMessage });

      logInfo("Sent full email via button click", {
        channel_id: event.channel_id,
        sender_id: event.sender_id,
        emailId: messageId,
      });
    } catch (error) {
      logError("Failed to handle email view button click", {
        error,
        button_id: event.button_id,
        sender_id: event.sender_id,
        channel_id: event.channel_id,
      });

      // Try to notify user of error
      try {
        const user = await client.users.fetch(event.sender_id);
        if (user) {
          await user.sendDM({
            t: "❌ An error occurred while fetching the email. Please try again later.",
          });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user of email view error", {
          error: notifyError,
        });
      }
    }
    return;
  }

  // Handle inbox pagination button clicks
  if (event.button_id.startsWith("inbox_")) {
    try {
      const parts = event.button_id.split("_");
      if (parts.length < 4) {
        logWarn("Invalid inbox button ID format", {
          button_id: event.button_id,
        });
        return;
      }

      const action = parts[1]; // PREV or NEXT
      const botUserId = parts[2];
      const currentPage = parseInt(parts[3], 10);

      if (!Number.isFinite(currentPage)) {
        logWarn("Invalid page number in inbox button", {
          button_id: event.button_id,
        });
        return;
      }

      // Note: In DM context, only the recipient can see/click buttons
      // The botUserId in the button ID identifies which inbox to show

      let newPage: number;
      if (action === "PREV") {
        newPage = currentPage - 1;
      } else if (action === "NEXT") {
        newPage = currentPage + 1;
      } else {
        logWarn("Unknown inbox action", { action, button_id: event.button_id });
        return;
      }

      // Ensure page is valid
      if (newPage < 1) {
        newPage = 1;
      }

      logInfo("Handling inbox pagination", {
        action,
        currentPage,
        newPage,
        sender_id: event.sender_id,
      });

      // Remove buttons from the original message (only for channel messages, not DMs)
      try {
        const channel = await client.channels.fetch(event.channel_id);
        if (channel && event.message_id) {
          // Skip update for DMs - they can't be updated the same way
          const isDM = !event.channel_id || channel.is_private === true;
          if (isDM) {
            logInfo("Skipping message update for DM (not supported)", {
              message_id: event.message_id,
              channel_id: event.channel_id,
            });
          } else {
            // Only try to update channel messages
            const message = await channel.messages.fetch(event.message_id);
            if (message) {
              // Update message to remove buttons by not including components
              await message.update({
                components: [], // Empty components array removes all buttons
              });
              logInfo("Removed buttons from original inbox message", {
                message_id: event.message_id,
              });
            }
          }
        }
      } catch (updateError) {
        // Log but don't fail if we can't update the message
        logWarn("Failed to remove buttons from original message", {
          error: updateError,
          message_id: event.message_id,
        });
      }

      // Send loading message immediately
      const user = await client.users.fetch(botUserId);
      if (user) {
        await user.sendDM({
          t: "⏳ Loading inbox...",
        });
      }

      // Show the new page
      await showInboxPage(client, botUserId, event.channel_id, newPage);
    } catch (error) {
      logError("Failed to handle inbox pagination button click", {
        error,
        button_id: event.button_id,
        sender_id: event.sender_id,
        channel_id: event.channel_id,
      });

      // Try to notify user of error
      try {
        const user = await client.users.fetch(event.sender_id);
        if (user) {
          await user.sendDM({
            t: "❌ An error occurred while navigating pages. Please try again later.",
          });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user of inbox pagination error", {
          error: notifyError,
        });
      }
    }
    return;
  }

  // Handle send mail submit button clicks
  if (event.button_id.startsWith(SEND_MAIL_BUTTON_ID_PREFIX)) {
    logInfo("Send mail submit button clicked", {
      button_id: event.button_id,
      sender_id: event.sender_id,
    });

    try {
      const actorId = event.user_id || event.sender_id;
      const user = await client.users.fetch(actorId);
      if (!user) {
        logWarn("Could not resolve user for send mail button", {
          sender: event.sender_id,
        });
        return;
      }

      // Parse form data from extra_data
      let formData: { to?: string; subject?: string; body?: string } = {};
      if (event.extra_data) {
        try {
          formData = JSON.parse(event.extra_data);
          logInfo("Parsed form data", { formData });
        } catch (parseError) {
          logWarn("Failed to parse form data", {
            error: parseError,
            extra_data: event.extra_data,
          });
          await user.sendDM({
            t: "❌ Failed to parse form data. Please try again.",
          });
          return;
        }
      }

      // Validate form fields
      const { to, subject, body } = formData;

      if (!to || !subject || !body) {
        await user.sendDM({
          t: "❌ All fields (To, Subject, Body) are required. Please fill out the form completely.",
        });
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(to)) {
        await user.sendDM({
          t: "❌ Invalid email address format. Please enter a valid email.",
        });
        return;
      }

      await user.sendDM({
        t: "📤 Sending email...",
      });

      // Determine bot user id encoded in the button ID (baseId = "<ownerId>_<ts>")
      const base = event.button_id.replace(SEND_MAIL_BUTTON_ID_PREFIX, "");
      const ownerId = base.split("_")[0] || event.user_id;

      // Send the email using Gmail API (bot user's OAuth tokens)
      const result = await sendUserEmail(
        ownerId,
        to,
        subject,
        body
      );

      if (result.success) {
        await user.sendDM({
          t: `✅ Email sent successfully!\n\n**To:** ${to}\n**Subject:** ${subject}`,
        });
        logInfo("Email sent via button click", {
          sender_id: event.sender_id,
          to,
          subject,
        });
      } else {
        let errorMessage = "❌ Failed to send email.";

        if (result.activationUrl) {
          errorMessage += `\n\n⚠️ **Gmail API access is not enabled.**\n\nPlease visit this link to enable Gmail API and try again:\n${result.activationUrl}`;
        } else if (result.status === 401) {
          errorMessage += "\n\nYour Gmail session may have expired. Please try logging in again with `*login`.";
        } else if (result.message) {
          errorMessage += `\n\n**Error:** ${result.message}`;
        } else {
          errorMessage += "\n\nPlease check your OAuth connection and try again.";
        }

        await user.sendDM({ t: errorMessage });
        logWarn("Failed to send email via button click", {
          sender_id: event.sender_id,
          error: result.error,
          status: result.status,
        });
      }
    } catch (error) {
      logError("Failed to handle send mail button click", {
        error,
        button_id: event.button_id,
        sender_id: event.sender_id,
      });

      try {
        const user = await client.users.fetch(event.sender_id);
        if (user) {
          await user.sendDM({
            t: "❌ An unexpected error occurred while sending the email. Please try again later.",
          });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user of send mail error", {
          error: notifyError,
        });
      }
    }
    return;
  }

  // Handle send mail cancel button clicks
  if (event.button_id.startsWith(CANCEL_SEND_MAIL_BUTTON_ID_PREFIX)) {
    logInfo("Send mail cancel button clicked", {
      button_id: event.button_id,
      sender_id: event.sender_id,
    });

    try {
      const actorId = event.user_id || event.sender_id;
      const user = await client.users.fetch(actorId);
      if (!user) {
        logWarn("Could not resolve user for cancel button", {
          sender: event.sender_id,
        });
        return;
      }

      await user.sendDM({
        t: "❌ Email sending cancelled.",
      });

      logInfo("Email sending cancelled", {
        sender_id: event.sender_id,
      });
    } catch (error) {
      logWarn("Failed to handle cancel button click", {
        error,
        button_id: event.button_id,
      });
    }
    return;
  }

  // Log unhandled button clicks
  logWarn("Unhandled button click", {
    button_id: event.button_id,
    sender_id: event.sender_id,
  });
}
