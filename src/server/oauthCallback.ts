import { Request, Response } from "express";
import { decodeStateToken } from "../services/oauthService.js";
import { exchangeCodeForTokens, storeOAuthTokens } from "../services/tokenService.js";
import { fetchGoogleUserInfo } from "../services/userInfoService.js";
import { hasValidOAuthTokens } from "../services/userService.js";
import { logInfo, logWarn, logError } from "../logger.js";
import { env } from "../config/env.js";
import type { MezonClient } from "mezon-sdk";
import { renderSuccessPage, renderErrorPage, renderDeniedPage } from "../utils/callbackPages.js";
import { InteractiveBuilder } from "mezon-sdk";

let botClient: MezonClient | null = null;

export function setBotClient(client: MezonClient): void {
  botClient = client;
}

/**
 * OAuth callback handler
 * Handles the redirect from Google OAuth
 */
export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error, error_description } = req.query;

  // Handle user denial or OAuth errors
  if (error) {
    const errorStr = typeof error === "string" ? error : String(error);
    logWarn("OAuth error from provider", { error: errorStr, error_description });

    // Check if user denied access
    if (errorStr === "access_denied" || errorStr === "user_cancelled") {
      res.status(200).send(renderDeniedPage());
      return;
    }

    // Other OAuth errors
    const errorMsg = typeof error_description === "string"
      ? error_description
      : `Error: ${errorStr}`;
    res.status(400).send(renderErrorPage(
      "Authorization Failed",
      "An error occurred during the authorization process.",
      errorMsg
    ));
    return;
  }

  if (!code || !state || typeof code !== "string" || typeof state !== "string") {
    logWarn("Invalid OAuth callback parameters", { code: !!code, state: !!state });
    res.status(400).send(renderErrorPage(
      "Invalid Request",
      "Missing required parameters. Please try again."
    ));
    return;
  }

  try {
    // Decode bot user ID from state (no database lookup needed)
    const botUserId = decodeStateToken(state);
    if (!botUserId) {
      logWarn("Invalid OAuth state token", { state: state.substring(0, 8) + "..." });
      res.status(400).send(renderErrorPage(
        "Invalid Request",
        "The authorization link is invalid.",
        "Please run the `*login` command again to get a new authorization link."
      ));
      return;
    }

    // Check if user already has valid OAuth tokens
    const existingTokens = await hasValidOAuthTokens(botUserId);
    if (existingTokens.hasTokens) {
      logWarn("User already has valid OAuth tokens, rejecting callback", {
        botUserId,
        email: existingTokens.email
      });
      res.status(400).send(renderErrorPage(
        "Already Connected",
        "You already have a Gmail account connected.",
        existingTokens.email
          ? `Your account ${existingTokens.email} is already connected. Run \`*logout\` first if you want to connect a different account.`
          : "Run `*logout` first if you want to connect a different account."
      ));
      return;
    }

    if (!env.oauthRedirectUri) {
      logError("OAUTH_REDIRECT_URI not configured");
      res.status(500).send(renderErrorPage(
        "Server Error",
        "OAuth redirect URI not configured.",
        "Please contact support."
      ));
      return;
    }

    const tokens = await exchangeCodeForTokens(code, env.oauthRedirectUri);
    if (!tokens) {
      logWarn("Failed to exchange code for tokens", { botUserId });
      res.status(500).send(renderErrorPage(
        "Authorization Failed",
        "Failed to exchange authorization code.",
        "The authorization code may have expired. Please try again."
      ));
      return;
    }

    const userInfo = await fetchGoogleUserInfo(tokens.accessToken);

    logInfo("Fetched user info from Google", {
      botUserId,
      email: userInfo.email,
      name: userInfo.name,
      verified: userInfo.verified_email,
    });

    const stored = await storeOAuthTokens(
      botUserId,
      tokens.accessToken,
      tokens.refreshToken,
      tokens.expiresIn,
      tokens.scope,
      userInfo
    );

    if (!stored) {
      logWarn("Failed to store tokens", { botUserId });
      res.status(500).send(renderErrorPage(
        "Storage Failed",
        "Failed to store authorization tokens.",
        "Please contact support or try again."
      ));
      return;
    }

    if (botClient) {
      try {
        const user = await botClient.users.fetch(botUserId);
        if (user) {
          const embedBuilder = new InteractiveBuilder("✅ Successfully Connected!")
            .setDescription("Your Gmail account has been connected successfully. You can now receive email alerts!");

          if (userInfo.email) {
            embedBuilder.addField("Connected Account", userInfo.email, false);
          }

          embedBuilder.addField("What's next?", "You'll receive notifications when new emails arrive in your inbox.", false);

          await user.sendDM({
            embed: [embedBuilder.build()],
          });
          logInfo("Notified user of successful OAuth", {
            botUserId,
            email: userInfo.email,
            name: userInfo.name,
          });
        }
      } catch (notifyError) {
        logWarn("Failed to notify user", { error: notifyError, botUserId });
      }
    }

    res.status(200).send(renderSuccessPage(userInfo.email || undefined));

    logInfo("OAuth callback completed successfully", {
      botUserId,
      email: userInfo.email,
      name: userInfo.name,
    });
  } catch (error) {
    logError("OAuth callback error", error);
    res.status(500).send(renderErrorPage(
      "Server Error",
      "An unexpected error occurred during authorization.",
      "Please try again or contact support if the problem persists."
    ));
  }
}

