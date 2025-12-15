import { MezonClient } from "mezon-sdk";
import { env } from "../config/env.js";
import { logError, logInfo } from "../logger.js";

export function createClient(): MezonClient {
  const client = new MezonClient({
    botId: env.botId,
    token: env.token,
  });

  client.on("ready", () => logInfo("Bot ready"));
  client.on("error", (err: unknown) => logError("Client error", err));

  return client;
}

