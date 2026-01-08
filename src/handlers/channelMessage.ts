import { resolveCommand, resolveDmCommand } from "../commands/index.js";
import { logWarn, logInfo } from "../logger.js";
import type { ChannelMessage, MezonClient } from "mezon-sdk";
import { sendDMWithRetry } from "../utils/sendDM.js";

// Track processed commands by sender_id + text + timestamp window
const processedCommands = new Map<string, number>();
const COMMAND_DEDUPE_WINDOW = 5000; // 5 seconds

setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processedCommands.entries()) {
    if (now - timestamp > COMMAND_DEDUPE_WINDOW) {
      processedCommands.delete(key);
    }
  }
}, 1000); // Clean up every second

export async function handleChannelMessage(
  client: MezonClient,
  event: ChannelMessage
): Promise<void> {
  const messageId = event.message_id;
  if (!messageId) {
    return;
  }

  const text = event.content?.t;
  if (!text) {
    logInfo("Ignoring message without text content", { message_id: messageId });
    return;
  }

  const trimmedText = text.trim();

  // Check for duplicate commands from same user within time window
  // This catches cases where SDK sends same message with different message_ids
  const commandDedupeKey = `${event.sender_id}_${trimmedText}`;
  const lastProcessed = processedCommands.get(commandDedupeKey);
  const now = Date.now();

  if (lastProcessed && (now - lastProcessed) < COMMAND_DEDUPE_WINDOW) {
    logInfo("Ignoring duplicate command within time window", {
      message_id: messageId,
      commandDedupeKey,
      timeSinceLast: now - lastProcessed,
      sender_id: event.sender_id,
      text: trimmedText
    });
    return;
  }

  // Mark as processed IMMEDIATELY to prevent race conditions
  // This must happen before any async operations
  processedCommands.set(commandDedupeKey, now);

  if (event.sender_id === client.clientId) {
    logInfo("Ignoring self message", { message_id: messageId });
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

  const command = isDM ? resolveDmCommand(trimmedText) : resolveCommand(trimmedText);

  if (!command) {
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
    logInfo("Dispatch command", { text: trimmedText, isDM, sender_id: event.sender_id, message_id: messageId });
    await command(client, event);
  } catch (error) {
    logWarn("Command failed", { text: trimmedText, error, message_id: messageId });
  }
}

