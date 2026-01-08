import { resolveCommand, resolveDmCommand } from "../commands/index.js";
import { logWarn, logInfo } from "../logger.js";
import type { ChannelMessage, MezonClient } from "mezon-sdk";
import { sendDMWithRetry } from "../utils/sendDM.js";

const processedMessages = new Set<string>();
const MESSAGE_CACHE_TTL = 60000;

setInterval(() => {
  processedMessages.clear();
}, MESSAGE_CACHE_TTL);

export async function handleChannelMessage(
  client: MezonClient,
  event: ChannelMessage
): Promise<void> {
  if (!event.message_id) {
    return;
  }

  if (processedMessages.has(event.message_id)) {
    logInfo("Ignoring duplicate message", { message_id: event.message_id });
    return;
  }

  processedMessages.add(event.message_id);

  const text = event.content?.t;
  if (!text) {
    logInfo("Ignoring message without text content", { message_id: event.message_id });
    return;
  }

  if (event.sender_id === client.clientId) {
    logInfo("Ignoring self message", { message_id: event.message_id });
    return;
  }

  let isDM = !event.clan_id;
  if (!isDM) {
    try {
      const channel = await client.channels.fetch(event.channel_id);
      if (channel?.is_private === true) {
        isDM = true;
      }
    } catch (err) {
      logWarn("Failed to inspect channel for DM detection", { channel_id: event.channel_id, error: err });
    }
  }

  const command = isDM ? resolveDmCommand(text) : resolveCommand(text);
  if (!command) {
    const trimmedText = text.trim();
    const isCommandAttempt = trimmedText.startsWith("*");

    if (isCommandAttempt && isDM) {
      try {
        const user = await client.users.fetch(event.sender_id);
        if (user) {
          await sendDMWithRetry(
            user,
            `❌ Command not found: \`${trimmedText}\`\n\nUse \`*help\` to see all available commands.`
          );
          logInfo("Sent command not found message", { text: trimmedText, sender_id: event.sender_id });
        }
      } catch (error) {
        logWarn("Failed to send command not found message after retries", { error, text: trimmedText });
      }
    }

    logInfo("No command matched", { text: trimmedText, isDM, sender_id: event.sender_id });
    return;
  }

  try {
    logInfo("Dispatch command", { text, isDM, sender_id: event.sender_id });
    await command(client, event);
  } catch (error) {
    logWarn("Command failed", { text, error });
  }
}

