import express from "express";
import { logInfo, logError } from "../logger.js";
import { handleOAuthCallback, setBotClient } from "./oauthCallback.js";
import { env } from "../config/env.js";
import type { MezonClient } from "mezon-sdk";
import { sendUserEmail } from "../services/emailService.js";
import { handleGmailPushNotification } from "../services/gmailPushService.js";

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let botClient: MezonClient | null = null;

app.get("/oauth/callback", handleOAuthCallback);
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Gmail Push Notification webhook endpoint
app.post("/webhooks/gmail", async (req, res) => {
  // Immediately respond to Pub/Sub
  res.status(200).send("OK");

  if (!botClient) {
    logError("Bot client not available for webhook");
    return;
  }

  try {
    const message = req.body?.message;
    if (message?.data) {
      const decoded = Buffer.from(message.data, "base64").toString();
      const data = JSON.parse(decoded);
      
      // Process notification asynchronously
      handleGmailPushNotification(botClient, data).catch((error) => {
        logError("Error processing Gmail push notification", { error });
      });
    }
  } catch (error) {
    logError("Error parsing Gmail webhook", { error });
  }
});

/**
 * Start the web server for OAuth callbacks
 */
export function startWebServer(client: MezonClient, port: number = 3000): void {
  setBotClient(client);
  botClient = client;

  app.listen(port, () => {
    logInfo(`Web server started on port ${port}`, {
      oauthCallbackUrl: env.oauthRedirectUri,
    });
  });
}

