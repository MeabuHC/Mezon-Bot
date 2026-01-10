import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";

export const runPing: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);

    if (!user) {
      logWarn("Could not resolve user for ping command", { sender: event.sender_id });
      return;
    }

    await user.sendDM({
      t: "🏓 **Pong!** Bot is online and working!",
    });

    logInfo("Ping command executed", {
      sender_id: event.sender_id,
    });
  } catch (error) {
    logWarn("Failed to execute ping command", {
      error,
      sender_id: event.sender_id,
    });
  }
};

