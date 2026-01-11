import { createClient } from "./client/client.js";
import { registerEvents } from "./client/events.js";
import { logError, logInfo } from "./logger.js";
import { startWebServer } from "./server/index.js";
import { env } from "./config/env.js";
import { resumeAllPolling } from "./services/emailPollingService.js";
import "./config/env.js";
import util from "util";

process.on("unhandledRejection", (reason) => {
  logError("Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  logError("Uncaught exception", error);
});

async function main() {
  const client = createClient();
  try {
    await client.login();
  } catch (error) {
    logError("Login to Mezon failed", { error: util.inspect(error, { depth: 5 }) });
    // Exit so the process manager (Render) records a failed start
    process.exit(1);
  }
  registerEvents(client);

  // Always start a minimal web server so platform (e.g. Render) can detect open port.
  // OAuth callbacks will only work if `OAUTH_REDIRECT_URI` is set in the environment.
  startWebServer(client, env.port);
  if (!env.oauthRedirectUri) {
    logInfo("OAuth not configured - web server started without OAuth callback route");
  }

  // Resume polling for all active subscriptions
  await resumeAllPolling(client);
}

main()
  .then(() => {
    logInfo("Bot start!");
  })
  .catch((error) => {
    logError("Bot failed to start", error);
  });

