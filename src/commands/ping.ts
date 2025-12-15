import {
  replyWithPong,
  sendChannelPong,
  sendHelloDM,
} from "../services/messagingService.js";
import type { MezonClient } from "mezon-sdk";

export async function runPing(
  client: MezonClient,
  event: any
): Promise<void> {
  const channel = await client.channels.fetch(event.channel_id);
  const message = await channel.messages.fetch(event.message_id);

  await replyWithPong(message);
  await sendChannelPong(channel);
  await sendHelloDM(client, event);
}

