import { createClient } from "./client/client.js";
import { registerEvents } from "./client/events.js";
import { logError, logInfo } from "./logger.js";
import { OAuthCallbackServer } from "./services/oauthServer.js";
import "./config/env.js";

async function main() {
  const client = createClient();
  registerEvents(client);

  // Start OAuth callback server
  const oauthServer = new OAuthCallbackServer(client);
  await oauthServer.start();

  await client.login();
}

main()
  .then(() => {
    logInfo("Bot start!");
  })
  .catch((error) => {
    logError("Bot failed to start", error);
  });

