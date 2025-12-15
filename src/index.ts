import { createClient } from "./client/client.js";
import { registerEvents } from "./client/events.js";
import { logError, logInfo } from "./logger.js";
import "./config/env.js";

async function main() {
  const client = createClient();
  registerEvents(client);
  await client.login();
}

main()
  .then(() => {
    logInfo("Bot start!");
  })
  .catch((error) => {
    logError("Bot failed to start", error);
  });

