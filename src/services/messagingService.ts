import { logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { Message } from "mezon-sdk/dist/cjs/mezon-client/structures/Message.js";
import type { TextChannel } from "mezon-sdk/dist/cjs/mezon-client/structures/TextChannel.js";
import type { User } from "mezon-sdk/dist/cjs/mezon-client/structures/User.js";

export async function replyWithPong(message: Message): Promise<void> {
  await message.reply({ t: "reply pong" });
}

export async function sendChannelPong(channel: TextChannel): Promise<void> {
  await channel.send({ t: "channel send pong" });
}

export async function sendHelloDM(
  client: MezonClient,
  event: any
): Promise<void> {
  const user: User | undefined = await client.users.fetch(event.sender_id);

  if (!user) {
    logWarn("Could not resolve user for DM", { sender: event.sender_id });
    return;
  }

  await user.sendDM({ t: "hello DM" });
}

