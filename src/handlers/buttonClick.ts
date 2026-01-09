import { logInfo, logWarn, logError } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";
import { fetchEmailById } from "../services/gmailFetchService.js";
import { getCachedEmail } from "../utils/emailCache.js";


export async function handleButtonClick(
  client: MezonClient,
  event: MessageButtonClicked
): Promise<void> {
  logInfo("Button clicked", { 
    button_id: event.button_id, 
    sender_id: event.sender_id,
    channel_id: event.channel_id 
  });

  if (event.button_id.startsWith("oauth_login_")) {
    try {
      const user = await client.users.fetch(event.sender_id);
      if (!user) {
        logWarn("Could not resolve user for OAuth button", { sender: event.sender_id });
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
    logInfo("Email view button clicked", { button_id: event.button_id, sender_id: event.sender_id });
    
    try {
      const messageId = event.button_id.replace("email_view_", "");
      logInfo("Extracted message ID", { messageId, botUserId: event.sender_id });
      
      const user = await client.users.fetch(event.sender_id);
      
      if (!user) {
        logWarn("Could not resolve user for email view", { sender: event.sender_id });
        return;
      }

      logInfo("Fetching email from Gmail", { messageId, botUserId: event.sender_id });
      
      // Check cache first
      let email = getCachedEmail(messageId);
      
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
        subject: email.subject 
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
        cleanBody = cleanBody.substring(0, 1500) + "\n\n... (content truncated)";
      }

      const fullMessage = `📧 **Full Email**\n\n` +
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
        logWarn("Failed to notify user of email view error", { error: notifyError });
      }
    }
    return;
  }

  // Log unhandled button clicks
  logWarn("Unhandled button click", { 
    button_id: event.button_id, 
    sender_id: event.sender_id 
  });
}

