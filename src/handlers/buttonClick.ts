import { logInfo, logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { DEMO_BUTTON_ID } from "../commands/button.js";
import { PrismaClient } from "@prisma/client";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";
import { fetchEmailById } from "../services/gmailFetchService.js";

const prisma = new PrismaClient();

export async function handleButtonClick(
  client: MezonClient,
  event: MessageButtonClicked
): Promise<void> {
  if (event.button_id.startsWith(DEMO_BUTTON_ID)) {
    try {
      const channel = await client.channels.fetch(event.channel_id);
      await channel.send({ t: "Button clicked!" });
      logInfo("Handled demo button click", {
        channel_id: event.channel_id,
        sender_id: event.sender_id,
      });
    } catch (error) {
      logWarn("Failed to handle button click", { error, channel_id: event.channel_id });
    }
    return;
  }

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
    try {
      const messageId = event.button_id.replace("email_view_", "");
      const user = await client.users.fetch(event.sender_id);
      
      if (!user) {
        logWarn("Could not resolve user for email view", { sender: event.sender_id });
        return;
      }

      const email = await fetchEmailById(event.sender_id, messageId);
      
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
      logWarn("Failed to handle email view button click", {
        error,
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
  }
}

