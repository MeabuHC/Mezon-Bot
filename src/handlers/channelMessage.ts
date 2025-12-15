import { resolveCommand } from "../commands/index.js";
import { logWarn } from "../logger.js";
import type { MezonClient } from "mezon-sdk";

export async function handleChannelMessage(
  client: MezonClient,
  event: any
): Promise<void> {
  const text = event?.content?.t as string | undefined;
  if (!text) return;

  const command = resolveCommand(text);
  if (!command) return;

  try {
    await command(client, event);
  } catch (error) {
    logWarn("Command failed", { text, error });
  }
}

