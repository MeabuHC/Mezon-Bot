import { logWarn } from "../logger.js";
import {
  replyWithPong,
  sendChannelPong,
  sendHelloDM,
} from "../services/messagingService.js";
import { CommandHandler } from "../types/mezon.js";

export const runPing: CommandHandler = async (client, event) => {
  const channel = await client.channels.fetch(event.channel_id);
  const message = await channel.messages.fetch(event.message_id as string);
  if (!message) {
    logWarn("Message not found", { channel_id: event.channel_id, message_id: event.message_id });
    return;
  }

  await replyWithPong(message);
  await sendChannelPong(channel);
  await sendHelloDM(client, event);
};
