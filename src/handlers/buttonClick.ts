import { logInfo, logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { DEMO_BUTTON_ID } from "../commands/button.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";
import { CANCEL_SEND_MAIL_BUTTON_ID_PREFIX, SEND_MAIL_BUTTON_ID_PREFIX } from "../commands/sendMail.js";
import { sendUserEmail } from "../services/emailService.js";

export async function handleButtonClick(
  client: MezonClient,
  event: MessageButtonClicked
): Promise<void> {
  // Demo button handler
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

  // Handle interactive sendMail form buttons
  if (event.button_id.startsWith(SEND_MAIL_BUTTON_ID_PREFIX)) {
    logInfo("Handling sendMail submit button click", {
      button_id: event.button_id,
      sender_id: event.user_id,
      user_id: event.user_id,
      extra_data: event.extra_data,
    });

    try {
      let to = "";
      let subject = "";
      let body = "";

      try {
        const parsed = event.extra_data ? JSON.parse(event.extra_data) : {};
        // Try a few common shapes for interactive input payloads
        const inputs: any = parsed.inputs || parsed.fields || parsed;

        if (Array.isArray(inputs)) {
          for (const f of inputs) {
            if (!f) continue;
            const id = f.id || f.name;
            if (id === "to") to = f.value || "";
            if (id === "subject") subject = f.value || "";
            if (id === "body") body = f.value || "";
          }
        } else if (inputs && typeof inputs === "object") {
          to = inputs.to || "";
          subject = inputs.subject || "";
          body = inputs.body || "";
        }
      } catch (parseError) {
        logWarn("Failed to parse extra_data for sendMail", {
          error: parseError,
          extra_data: event.extra_data,
        });
      }

      const actorId = event.user_id || event.sender_id;
      const clientUser = await client.users.fetch(actorId);
      if (!clientUser) {
        logWarn("Could not resolve user for sendMail submit", { actorId, sender_id: event.sender_id, user_id: event.user_id });
        return;
      }

      if (!to || !subject || !body) {
        await clientUser.sendDM({
          t: "❌ Missing one or more fields (To, Subject, Body). Please fill out all fields and try again.",
        });
        return;
      }

      const result = await sendUserEmail(event.user_id, to, subject, body);

      if (result.success) {
        await clientUser.sendDM({ t: `✅ Email sent successfully to ${to}!` });
        logInfo("sendMail email sent from button click", {
          actorId,
          to,
        });
      } else if (result.activationUrl) {
        await clientUser.sendDM({
          t: `❌ Gmail API is disabled for the Google Cloud project used by this bot. Please enable it here and try again:\n${result.activationUrl}`,
        });
        logWarn("sendMail email failed - Gmail API disabled (button)", {
          actorId,
          sender_id: event.sender_id,
          user_id: event.user_id,
          to,
          activationUrl: result.activationUrl,
        });
      } else {
        await clientUser.sendDM({
          t: "❌ Failed to send email. Please make sure you have connected Gmail using `*login` and try again.",
        });
        logWarn("sendMail email failed from button click", {
          actorId,
          sender_id: event.sender_id,
          user_id: event.user_id,
          to,
          error: result.error,
        });
      }
    } catch (error) {
      logWarn("Error while handling sendMail submit button", {
        error,
        button_id: event.button_id,
      });
    }

    return;
  }

  if (event.button_id.startsWith(CANCEL_SEND_MAIL_BUTTON_ID_PREFIX)) {
    logInfo("Handling sendMail cancel button click", {
      button_id: event.button_id,
      sender_id: event.sender_id,
      user_id: event.user_id,
    });

    try {
      const actorId = event.user_id || event.sender_id;
      const clientUser = await client.users.fetch(actorId);
      if (clientUser) {
        await clientUser.sendDM({ t: "✅ Email sending cancelled." });
      }
    } catch (error) {
      logWarn("Error while handling sendMail cancel button", {
        error,
        button_id: event.button_id,
      });
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
  }
}

