import { createClient } from "./client/client.js";
import { registerEvents } from "./client/events.js";
import { logError, logInfo } from "./logger.js";
import { startWebServer } from "./server/index.js";
import { env } from "./config/env.js";
import "./config/env.js";

async function main() {
  const client = createClient();
  registerEvents(client);
  await client.login();

  if (env.oauthRedirectUri) {
    const port = parseInt(process.env.PORT || "3000", 10);
    startWebServer(client, port);
  } else {
    logInfo("OAuth not configured - web server not started");
  }
}

main()
  .then(() => {
    logInfo("Bot start!");
  })
  .catch((error) => {
    logError("Bot failed to start", error);
  });

