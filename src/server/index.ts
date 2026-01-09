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

  // Serve a simple send-mail HTML form for a given botUserId
  app.get("/sendmail/form", (req, res) => {
    const botUserId = String(req.query.user || "");
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Send Email</title>
    <style>
      body{font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial;margin:24px;background:#f6f8fa}
      .card{max-width:720px;margin:0 auto;background:#fff;padding:20px;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,0.08)}
      label{display:block;margin-top:12px;font-weight:600}
      input[type=text],textarea{width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;margin-top:6px}
      textarea{min-height:140px}
      .row{display:flex;gap:8px;margin-top:12px}
      button{padding:10px 16px;border-radius:6px;border:0;cursor:pointer}
      .btn-primary{background:#5865F2;color:#fff}
      .btn-secondary{background:#e6e6e6}
      .notice{margin-top:12px;color:#2d3748}
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Send Email</h2>
      <p class="notice">Fill the fields and press Send. This will send from your connected Gmail account.</p>
      <form id="sendForm">
        <input type="hidden" id="botUserId" value="${botUserId}" />
        <label for="to">To</label>
        <input id="to" type="text" placeholder="recipient@example.com" />
        <label for="subject">Subject</label>
        <input id="subject" type="text" placeholder="Subject line" />
        <label for="body">Body</label>
        <textarea id="body" placeholder="Email body..."></textarea>
        <div class="row">
          <button type="button" id="sendBtn" class="btn-primary">Send</button>
          <button type="button" id="cancelBtn" class="btn-secondary">Cancel</button>
        </div>
        <div id="result" style="margin-top:12px"></div>
      </form>
    </div>
    <script>
      document.getElementById('cancelBtn').addEventListener('click', () => {
        window.close?.();
      });

      document.getElementById('sendBtn').addEventListener('click', async () => {
        const botUserId = document.getElementById('botUserId').value;
        const to = document.getElementById('to').value;
        const subject = document.getElementById('subject').value;
        const body = document.getElementById('body').value;
        const resultEl = document.getElementById('result');
        resultEl.textContent = 'Sending...';

        try {
          const resp = await fetch('/sendmail/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ botUserId, to, subject, body })
          });
          const data = await resp.json();
          if (data.success) {
            resultEl.textContent = '✅ Email sent';
          } else if (data.activationUrl) {
            resultEl.innerHTML = '❌ Gmail API disabled. <a href="' + data.activationUrl + '" target="_blank">Enable it</a>';
          } else {
            resultEl.textContent = '❌ Failed: ' + (data.message || JSON.stringify(data.error));
          }
        } catch (e) {
          resultEl.textContent = '❌ Error: ' + e;
        }
      });
    </script>
  </body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.post('/sendmail/submit', express.json(), async (req, res) => {
    try {
      const { botUserId, to, subject, body } = req.body || {};
      if (!botUserId) return res.status(400).json({ success: false, message: 'Missing botUserId' });

      const result = await sendUserEmail(botUserId, to || '', subject || '', body || '');
      return res.json(result);
    } catch (error) {
      logError('Send mail submit error', error);
      return res.status(500).json({ success: false, error: String(error) });
    }
  });
}

