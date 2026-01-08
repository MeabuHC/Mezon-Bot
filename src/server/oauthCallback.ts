import { Request, Response } from "express";
import { validateOAuthState, deleteOAuthState } from "../services/oauthService.js";
import { exchangeCodeForTokens, storeOAuthTokens } from "../services/tokenService.js";
import { logInfo, logWarn, logError } from "../logger.js";
import { env } from "../config/env.js";
import type { MezonClient } from "mezon-sdk";

let botClient: MezonClient | null = null;

export function setBotClient(client: MezonClient): void {
  botClient = client;
}

/**
 * OAuth callback handler
 * Handles the redirect from Google OAuth
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query;

  if (error) {
    logWarn("OAuth error from provider", { error });
    res.status(400).send(`
      <html>
        <body>
          <h1>Authorization Failed</h1>
          <p>Error: ${error}</p>
                  <p>Please try again by running the *login command in the bot.</p>
        </body>
      </html>
    `);
    return;
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    logWarn("Invalid OAuth callback parameters", { code: !!code, state: !!state });
    res.status(400).send(`
      <html>
        <body>
          <h1>Invalid Request</h1>
          <p>Missing required parameters. Please try again.</p>
        </body>
      </html>
    `);
    return;
  }

  try {
    const botUserId = await validateOAuthState(state);
    if (!botUserId) {
      logWarn("Invalid or expired OAuth state", { state: state.substring(0, 8) + "..." });
      res.status(400).send(`
        <html>
          <body>
            <h1>Invalid or Expired Request</h1>
                    <p>The authorization link has expired. Please run the *login command again.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!env.oauthRedirectUri) {
      logError("OAUTH_REDIRECT_URI not configured");
      res.status(500).send(`
        <html>
          <body>
            <h1>Server Error</h1>
            <p>OAuth redirect URI not configured.</p>
          </body>
        </html>
      `);
      return;
    }

    const tokens = await exchangeCodeForTokens(code, env.oauthRedirectUri);
    if (!tokens) {
      logWarn("Failed to exchange code for tokens", { botUserId });
      res.status(500).send(`
        <html>
          <body>
            <h1>Authorization Failed</h1>
            <p>Failed to exchange authorization code. Please try again.</p>
          </body>
        </html>
      `);
      return;
    }

    const stored = await storeOAuthTokens(
      botUserId,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
      tokens.scope
    );

    if (!stored) {
      logWarn("Failed to store tokens", { botUserId });
      res.status(500).send(`
        <html>
          <body>
            <h1>Storage Failed</h1>
            <p>Failed to store tokens. Please contact support.</p>
          </body>
        </html>
      `);
      return;
    }

    await deleteOAuthState(state);

    if (botClient) {
      try {
        const user = await botClient.users.fetch(botUserId);
        if (user) {
          await user.sendDM({
            t: "✅ Successfully connected your Gmail account! You can now receive email alerts.",
          });
          logInfo("Notified user of successful OAuth", { botUserId });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user", { error: notifyError, botUserId });
      }
    }

    res.status(200).send(`
      <html>
        <head>
          <title>Authorization Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 10px;
              box-shadow: 0 10px 25px rgba(0,0,0,0.2);
              text-align: center;
            }
            h1 { color: #4CAF50; margin-top: 0; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Authorization Successful!</h1>
            <p>Your Gmail account has been connected successfully.</p>
            <p>You can close this window and return to the bot.</p>
          </div>
        </body>
      </html>
    `);

    logInfo("OAuth callback completed successfully", { botUserId });
  } catch (error) {
    logError("OAuth callback error", error);
    res.status(500).send(`
      <html>
        <body>
          <h1>Server Error</h1>
          <p>An error occurred during authorization. Please try again.</p>
        </body>
      </html>
    `);
  }
}

