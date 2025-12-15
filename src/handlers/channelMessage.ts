import { resolveCommand, resolveDmCommand } from "../commands/index.js";
import { logWarn, logInfo } from "../logger.js";
import type { ChannelMessage, MezonClient } from "mezon-sdk";

export async function handleChannelMessage(
  client: MezonClient,
  event: ChannelMessage
): Promise<void> {
  const text = event.content?.t;
  if (!text) {
    logInfo("Ignoring message without text content", { message_id: event.message_id });
    return;
  }

  // Skip messages sent by the bot itself to avoid loops.
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
    logInfo("No command matched", { text, isDM, sender_id: event.sender_id });
    return;
  }

  try {
    logInfo("Dispatch command", { text, isDM, sender_id: event.sender_id });
    await command(client, event);
  } catch (error) {
    logWarn("Command failed", { text, error });
  }
}

