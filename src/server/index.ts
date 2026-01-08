import express from "express";
import { logInfo, logError } from "../logger.js";
import { handleOAuthCallback, setBotClient } from "./oauthCallback.js";
import { env } from "../config/env.js";
import type { MezonClient } from "mezon-sdk";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.get("/oauth/callback", handleOAuthCallback);
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Start the web server for OAuth callbacks
 */
export function startWebServer(client: MezonClient, port: number = 3000): void {
  setBotClient(client);

  app.listen(port, () => {
    logInfo(`Web server started on port ${port}`, {
      oauthCallbackUrl: env.oauthRedirectUri,
    });
  });

  app.on("error", (error) => {
    logError("Web server error", error);
  });
}

