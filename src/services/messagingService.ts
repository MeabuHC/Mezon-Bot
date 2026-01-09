import { logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";
import type { User } from "../types/mezon.js";

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

