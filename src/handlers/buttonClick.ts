import { logInfo, logWarn, logError } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import { EMarkdownType, InteractiveBuilder } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";
import {
  fetchEmailById,
  type EmailData,
} from "../services/gmailFetchService.js";
import { getCachedEmail, type CachedEmail } from "../utils/emailCache.js";
import { showInboxPage } from "../commands/inbox.js";
import { decodeHtmlEntities } from "../utils/htmlDecode.js";
import {
  SEND_MAIL_BUTTON_ID_PREFIX,
  CANCEL_SEND_MAIL_BUTTON_ID_PREFIX,
} from "../commands/send.js";
import { sendUserEmail } from "../services/emailService.js";
import {
  starEmail,
  deleteEmail,
  archiveEmail,
  markEmailRead,
  restoreEmail,
} from "../services/emailActionService.js";

// Deduplicate rapid duplicate button events (in-memory)
const processedButtonClicks = new Set<string>();
const BUTTON_CLICK_TTL_MS = 3000; // ignore duplicates within 3s

setInterval(() => {
  processedButtonClicks.clear();
}, BUTTON_CLICK_TTL_MS);

/* =====================
   Helper utilities
   - Keep handler body small by extracting common operations.
   - Responsibilities: fetch user/channel safely, update message with DM fallback,
     parse the send-mail form fields, and basic email validation.
   ===================== */

const fetchUserSafe = async (client: MezonClient, id?: string | null) => {
  if (!id) return null;
  try {
    return await client.users.fetch(id);
  } catch (err) {
    logWarn("fetchUserSafe: failed to fetch user", { user_id: id, error: err });
    return null;
  }
};

const fetchChannelSafe = async (client: MezonClient, channelId?: string | null) => {
  if (!channelId) return null;
  try {
    return await client.channels.fetch(channelId);
  } catch (err) {
    logWarn("fetchChannelSafe: failed to fetch channel", { channel_id: channelId, error: err });
    return null;
  }
};

const updateMessageOrDM = async (client: MezonClient, channelId: string | undefined | null, messageId: string | undefined | null, user: any, payload: any) => {
  if (channelId) {
    const channel = await fetchChannelSafe(client, channelId);
    if (channel) {
      try {
        const msg = await channel.messages.fetch(messageId as string);
        await msg.update(payload);
        return { updated: true };
      } catch (err) {
        logWarn("updateMessageOrDM: failed to update message; will fallback to DM", { error: err, channel_id: channelId, message_id: messageId });
      }
    }
  }

  try {
    await user.sendDM(payload);
    return { dm: true };
  } catch (err) {
    logWarn("updateMessageOrDM: failed to send DM fallback", { error: err, user_id: user?.id });
    return { failed: true };
  }
};

const parseSendForm = (event: MessageButtonClicked) => {
  let parsed: any = {};
  if (event.extra_data) {
    parsed = JSON.parse(event.extra_data);
  }

  // attempt to detect the actual message prefix used in the form keys
  let actualMessageId: string | undefined;
  for (const k of Object.keys(parsed || {})) {
    const m = k.match(/^send-(.+?)-(to|subject|body)/);
    if (m && m[1]) {
      actualMessageId = m[1];
      break;
    }
  }

  const buttonBaseId = event.button_id.replace(SEND_MAIL_BUTTON_ID_PREFIX, "");
  const messageId = event.message_id || buttonBaseId;
  const prefix = actualMessageId || messageId;

  const get = (field: string) => parsed[`send-${prefix}-${field}`] ?? parsed[`send-${prefix}-${field}-plhder`];

  return {
    to: get("to")?.toString(),
    subject: get("subject")?.toString(),
    body: get("body")?.toString(),
    ownerId: buttonBaseId.split("_")[0] || event.user_id,
  };
};

const simpleEmailValid = (s?: string) => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);


export async function handleButtonClick(
  client: MezonClient,
  event: MessageButtonClicked
): Promise<void> {
  logInfo("Button clicked", {
    button_id: event.button_id,
    user_id: event.user_id,
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
      const user = await client.users.fetch(event.user_id);
      if (!user) {
        logWarn("Could not resolve user for OAuth button", { user_id: event.user_id });
        return;
      }

      if (!env.googleClientId || !env.oauthRedirectUri) {
        await user.sendDM({
          t: "❌ OAuth is not configured. Please contact support.",
        });
        return;
      }

      const oauthUrl = generateGmailOAuthUrl(
        event.user_id,
        env.oauthRedirectUri,
        env.googleClientId
      );

      await user.sendDM({
        t: `🔗 **Click this link to authorize:**\n\n${oauthUrl}`,
      });

      logInfo("Sent OAuth URL via button click", {
        channel_id: event.channel_id,
        user_id: event.user_id,
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
    logInfo("Email view button clicked", { button_id: event.button_id, user_id: event.user_id });

    try {
      const emailMessageId = event.button_id.replace("email_view_", "");
      logInfo("Extracted message ID", { messageId: emailMessageId, userId: event.user_id });

      const user = await client.users.fetch(event.user_id);

      if (!user) {
        logWarn("Could not resolve user for email view", { user_id: event.user_id });
        return;
      }

      // Hide the button by updating the notification message with only embed (no components)
      // Same pattern as inbox pagination and other button handlers
      try {
        const channelDmId = user.dmChannelId;
        const channel = await client.channels.fetch(channelDmId);
        const message = await channel.messages.fetch(event.message_id);

        // Get original embed
        const msgAny = message as any;
        const originalEmbed = msgAny.embed || msgAny.embeds?.[0] || msgAny.content?.embed?.[0];

        if (originalEmbed) {
          // Update with ONLY embed - omitting components removes all buttons
          const embed = Array.isArray(originalEmbed) ? originalEmbed : [originalEmbed];
          await message.update({ embed });

          logInfo("Removed view button from notification message", {
            message_id: event.message_id,
            channel_id: channelDmId,
          });
        } else {
          // If no embed, just update with empty to remove components
          await message.update({});
          logInfo("Removed view button from notification message (no embed found)", {
            message_id: event.message_id,
            channel_id: channelDmId,
          });
        }
      } catch (updateError) {
        logWarn("Failed to remove view button from notification message", {
          error: updateError,
          message_id: event.message_id,
          user_dmChannelId: user.dmChannelId,
          event_channel_id: event.channel_id,
          user_id: event.user_id,
        });
      }

      logInfo("Fetching email from Gmail", { messageId: emailMessageId, userId: event.user_id });

      // Check cache first
      let email: CachedEmail | EmailData | null = getCachedEmail(emailMessageId);

      if (!email) {
        logInfo("Email not in cache, fetching from Gmail API", { messageId: emailMessageId });
        const fetchedEmail = await fetchEmailById(event.user_id, emailMessageId);
        if (fetchedEmail) {
          // Convert EmailData to CachedEmail format
          email = {
            id: fetchedEmail.id,
            from: fetchedEmail.from,
            subject: fetchedEmail.subject,
            snippet: fetchedEmail.snippet,
            body: fetchedEmail.body,
            timestamp: fetchedEmail.timestamp,
            cachedAt: Date.now(),
          };
        }
      } else {
        logInfo("Email found in cache", { messageId: emailMessageId });
      }

      if (!email) {
        logWarn("Email not found", { messageId: emailMessageId, userId: event.user_id });
        await user.sendDM({
          t: "❌ Unable to fetch email. It may have been deleted or moved.",
        });
        return;
      }

      logInfo("Email fetched successfully", {
        messageId: emailMessageId,
        from: email.from,
        subject: email.subject,
      });

      // Clean up HTML tags and format body (EXACT same as *view command)
      let cleanBody = email.body
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove <style> tags and their content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove <script> tags and their content
        .replace(/<[^>]*>/g, "") // Remove remaining HTML tags
        .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
        .trim();
      
      // Decode HTML entities (e.g., &#7843; -> ả)
      cleanBody = decodeHtmlEntities(cleanBody);

      // Limit body length for embed (EXACT same as *view command - 1000 chars)
      const bodyPreview = cleanBody.length > 1000
        ? cleanBody.substring(0, 1000) + "\n\n... (content truncated)"
        : cleanBody;

      // Use EXACT same format as *view command
      const embed = new InteractiveBuilder(`📧 ${email.subject || "(no subject)"}`)
        .setDescription(bodyPreview)
        .addField("From", email.from, false)
        .addField("Date", new Date(email.timestamp).toLocaleString(), false)
        .build();

      // Send NEW message with embed (same as *view command)
      await user.sendDM({ embed: [embed] });

      logInfo("Sent full email via button click", {
        channel_id: event.channel_id,
        user_id: event.user_id,
        emailId: emailMessageId,
      });
    } catch (error) {
      logError("Failed to handle email view button click", {
        error,
        button_id: event.button_id,
        user_id: event.user_id,
        channel_id: event.channel_id,
      });

      // Try to notify user of error
      try {
        const user = await client.users.fetch(event.user_id);
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
      // Parse button ID format: inbox_PREV_botUserId_labelId_[query]_page
      // Or old format: inbox_PREV_botUserId_page (backward compatibility)
      let labelId = "INBOX";
      let query: string | undefined;
      let currentPage: number;
      
      if (parts.length >= 5) {
        // New format: inbox_PREV_botUserId_labelId_[query]_page
        labelId = parts[3];
        // Check if parts[4] is a query (base64 encoded) or page number
        const part4 = parts[4];
        if (part4 && !/^\d+$/.test(part4)) {
          // It's a query (base64 encoded)
          try {
            query = Buffer.from(part4, "base64url").toString("utf-8");
            currentPage = parseInt(parts[5] || "1", 10);
          } catch {
            // If decode fails, treat as page number (backward compatibility)
            currentPage = parseInt(part4, 10);
          }
        } else {
          // No query, part4 is page number
          currentPage = parseInt(part4, 10);
        }
      } else {
        // Old format: inbox_PREV_botUserId_page (backward compatibility)
        currentPage = parseInt(parts[3], 10);
      }

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
        user_id: event.user_id,
      });

      // Remove buttons from the original message by updating with only embed (no components)
      // EXACT REPLICATION of mezon-komu lines 218, 328-330
      // Use user.dmChannelId (same as mezon-komu) for DM channels
      try {
        const user = await client.users.fetch(event.user_id);
        if (user && user.dmChannelId) {
          const channelDmId = user.dmChannelId; // Line 218 in mezon-komu
          const channel = await client.channels.fetch(channelDmId); // Line 328 in mezon-komu
          const message = await channel.messages.fetch(event.message_id); // Line 329 in mezon-komu

          // Get the current embed from the message
          const msgAny = message as any;
          const currentEmbed = msgAny.embed || msgAny.embeds?.[0] || msgAny.content?.embed?.[0];

          if (currentEmbed) {
            // Create new embed array (mezon-komu line 312 creates embed as array)
            const embed = Array.isArray(currentEmbed) ? currentEmbed : [currentEmbed];

            // Update with ONLY embed - omitting components removes all buttons
            // EXACT same as mezon-komu line 330: await message.update({ embed });
            await message.update({ embed });

            logInfo("Removed buttons from original inbox message", {
              message_id: event.message_id,
              channel_id: channelDmId,
            });
          } else {
            // If no embed found, try updating with empty object
            await message.update({});
            logInfo("Removed buttons from original inbox message (no embed found, used empty update)", {
              message_id: event.message_id,
              channel_id: channelDmId,
            });
          }
        }
      } catch (updateError) {
        // Log but don't fail if we can't update the message
        logWarn("Failed to remove buttons from original inbox message", {
          error: updateError,
          message_id: event.message_id,
          user_id: event.user_id,
          channel_id: event.channel_id,
        });
      }

      // Send loading message immediately
      const user = await client.users.fetch(botUserId);
      if (user) {
        await user.sendDM({
          t: "⏳ Loading inbox...",
        });
      }

      // Show the new page with the same label and query
      await showInboxPage(client, botUserId, event.channel_id, newPage, labelId, query);
    } catch (error) {
      logError("Failed to handle inbox pagination button click", {
        error,
        button_id: event.button_id,
        user_id: event.user_id,
        channel_id: event.channel_id,
      });

      // Try to notify user of error
      try {
        const user = await client.users.fetch(event.user_id);
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
    logInfo("Send mail submit button clicked", { button_id: event.button_id, sender_id: event.sender_id });

    const actorId = event.user_id || event.sender_id;
    const user = await fetchUserSafe(client, actorId);
    if (!user) return;

    try {
      let parsed;
      try {
        parsed = parseSendForm(event);
      } catch (err) {
        await user.sendDM({ t: "❌ Failed to parse form data. Please try again." });
        return;
      }

      const { to, subject, body, ownerId } = parsed as any;
      if (!to || !subject || !body) {
        await user.sendDM({ t: "❌ All fields (To, Subject, Body) are required. Please fill out the form completely." });
        return;
      }

      if (!simpleEmailValid(to)) {
        await user.sendDM({ t: "❌ Invalid email address format. Please enter a valid email." });
        return;
      }

      const result = await sendUserEmail(ownerId, to, subject, body);

      if (!result.success) {
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
        logWarn("Failed to send email via button click", { sender_id: event.sender_id, error: result.error, status: result.status });
        return;
      }

      const textSendSuccess = `✅ Email sent successfully!\nTo: ${to}\nSubject: ${subject}\nBody: ${body}`;
      const msgSendSuccess = { t: textSendSuccess, mk: [{ type: EMarkdownType.PRE, s: 0, e: textSendSuccess.length }] };

      const channelIdToUse = event.channel_id || user.dmChannelId;
      await updateMessageOrDM(client, channelIdToUse, event.message_id, user, msgSendSuccess);

      logInfo("Email sent via button click", { sender_id: event.sender_id, to, subject });
    } catch (error) {
      logError("Failed to handle send mail button click", { error, button_id: event.button_id, sender_id: event.sender_id });
      try {
        const u = await client.users.fetch(event.user_id);
        if (u) await u.sendDM({ t: "❌ An unexpected error occurred while sending the email. Please try again later." });
      } catch (notifyError) {
        logWarn("Failed to send error message", { error: notifyError });
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

      // Update original message with cancellation (same pattern as daily - lines 2148-2162)
      if (!user.dmChannelId) {
        logWarn("User does not have a DM channel", {
          user_id: actorId,
        });
        return;
      }
      const channel = await client.channels.fetch(user.dmChannelId);
      const message = await channel.messages.fetch(event.message_id);
      const textSendCancel = "Email sending cancelled";
      const msgSendCancel = {
        t: textSendCancel,
        mk: [{ type: EMarkdownType.PRE, s: 0, e: textSendCancel.length }],
      };
      await message.update(msgSendCancel);

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

  // Handle email action buttons (star, delete, archive, etc.)
  if (event.button_id.startsWith("email_action_")) {
    logInfo("Email action button clicked", {
      button_id: event.button_id,
      user_id: event.user_id,
    });

    try {
      const actorId = event.user_id || event.sender_id;
      const user = await client.users.fetch(actorId);
      if (!user) {
        logWarn("Could not resolve user for email action", {
          user_id: actorId,
        });
        return;
      }

      if (!user.dmChannelId) {
        logWarn("User does not have a DM channel", { user_id: actorId });
        return;
      }

      // Extract action type and email ID from button ID
      // Format: email_action_{action}_{emailId}
      const buttonIdPrefix = "email_action_";
      const afterPrefix = event.button_id.substring(buttonIdPrefix.length);
      const firstUnderscoreIndex = afterPrefix.indexOf("_");
      
      if (firstUnderscoreIndex === -1) {
        logWarn("Invalid email action button ID format", {
          button_id: event.button_id,
        });
        return;
      }

      const action = afterPrefix.substring(0, firstUnderscoreIndex); // star, delete, archive, read, restore
      const emailId = afterPrefix.substring(firstUnderscoreIndex + 1); // Everything after action_

      // Perform the action
      let result;
      switch (action) {
        case "star": {
          // Determine if we're starring or unstarring by checking current state
          // We'll fetch the email first to check if it's starred
          const email = await fetchEmailById(actorId, emailId);
          const isStarred = email?.labels.includes("STARRED") ?? false;
          result = await starEmail(actorId, emailId, !isStarred);
          break;
        }
        case "delete":
          result = await deleteEmail(actorId, emailId);
          break;
        case "archive":
          result = await archiveEmail(actorId, emailId);
          break;
        case "read": {
          // Determine if we're marking as read or unread
          const email = await fetchEmailById(actorId, emailId);
          const isUnread = email?.labels.includes("UNREAD") ?? false;
          result = await markEmailRead(actorId, emailId, isUnread);
          break;
        }
        case "restore":
          result = await restoreEmail(actorId, emailId);
          break;
        default:
          logWarn("Unknown email action", { action, button_id: event.button_id });
          return;
      }

      // Update the message to show result and update buttons
      const channel = await client.channels.fetch(user.dmChannelId);
      const message = await channel.messages.fetch(event.message_id);

      // Get original embed and components
      const msgAny = message as any;
      const originalEmbed = msgAny.embed || msgAny.embeds?.[0] || msgAny.content?.embed?.[0];
      const originalComponents = msgAny.components || msgAny.content?.components || [];

      if (result.success) {
        // On success: Keep email visible, add success message, remove only the clicked button
        if (originalEmbed) {
          const embed = Array.isArray(originalEmbed) ? originalEmbed[0] : originalEmbed;
          const successMessage = result.message || "Action completed successfully.";
          
          // Build updated embed preserving original content
          const embedBuilder = new InteractiveBuilder(embed.title || "📧 Email");
          
          if (embed.description) {
            embedBuilder.setDescription(embed.description);
          }
          
          // Add success field at the top
          embedBuilder.addField("✅ Action Completed", successMessage, false);

          // Copy other fields (skip action completed field if it already exists)
          if (embed.fields) {
            for (const field of embed.fields) {
              if (field.name !== "✅ Action Completed") {
                embedBuilder.addField(field.name, field.value, field.inline || false);
              }
            }
          }

          // Remove only the clicked button from components
          const updatedComponents = originalComponents.map((row: any) => {
            if (row.components && Array.isArray(row.components)) {
              const filteredComponents = row.components.filter(
                (comp: any) => comp.id !== event.button_id
              );
              // Only include row if it still has buttons
              if (filteredComponents.length > 0) {
                return { components: filteredComponents };
              }
              return null;
            }
            return row;
          }).filter((row: any) => row !== null);

          // Update message with embed and remaining buttons
          await message.update({
            embed: [embedBuilder.build()],
            components: updatedComponents.length > 0 ? updatedComponents : undefined,
          });
        } else {
          // No embed, just show success message
          await message.update({
            t: `✅ ${result.message || "Action completed successfully."}`,
          });
        }

        logInfo("Email action completed successfully", {
          action,
          emailId,
          user_id: actorId,
        });
      } else {
        // On error: Keep email visible, add error message, keep all buttons
        const errorMsg = result.error || result.message || "Failed to perform action.";
        
        if (originalEmbed) {
          const embed = Array.isArray(originalEmbed) ? originalEmbed[0] : originalEmbed;
          
          // Build updated embed preserving original content
          const embedBuilder = new InteractiveBuilder(embed.title || "📧 Email");
          
          if (embed.description) {
            embedBuilder.setDescription(embed.description);
          }
          
          // Add error field at the top
          embedBuilder.addField("❌ Action Failed", errorMsg, false);

          // Copy other fields (skip error field if it already exists)
          if (embed.fields) {
            for (const field of embed.fields) {
              if (field.name !== "❌ Action Failed") {
                embedBuilder.addField(field.name, field.value, field.inline || false);
              }
            }
          }

          // Keep all original buttons so user can retry
          await message.update({
            embed: [embedBuilder.build()],
            components: originalComponents.length > 0 ? originalComponents : undefined,
          });
        } else {
          // No embed, just show error message
          await message.update({
            t: `❌ ${errorMsg}`,
          });
        }

        logWarn("Email action failed", {
          action,
          emailId,
          user_id: actorId,
          error: errorMsg,
        });
      }
    } catch (error) {
      logWarn("Failed to handle email action button click", {
        error,
        button_id: event.button_id,
        user_id: event.user_id,
      });

      try {
        const actorId = event.user_id || event.sender_id;
        const user = await client.users.fetch(actorId);
        if (user && user.dmChannelId) {
          const channel = await client.channels.fetch(user.dmChannelId);
          const message = await channel.messages.fetch(event.message_id);
          await message.update({
            t: "❌ An error occurred while performing the action. Please try again.",
          });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user of email action error", {
          error: notifyError,
        });
      }
    }
    return;
  }

  // Log unhandled button clicks
  logWarn("Unhandled button click", {
    button_id: event.button_id,
    user_id: event.user_id,
  });
}
