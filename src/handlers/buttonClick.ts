import { logInfo, logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { MessageButtonClicked } from "mezon-sdk/dist/cjs/rtapi/realtime.js";
import { DEMO_BUTTON_ID } from "../commands/button.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { env } from "../config/env.js";

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

      // Generate OAuth URL directly (no state database lookup needed)
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

