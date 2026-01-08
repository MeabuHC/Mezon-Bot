import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";
import { env } from "../config/env.js";

const prisma = new PrismaClient();

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string } | null> {
  if (!env.googleClientId || !env.googleClientSecret) {
    logWarn("OAuth credentials not configured");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      logWarn("Failed to exchange code for tokens", { status: response.status, error });
      return null;
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in || 3600,
      scope: data.scope || "",
    };
  } catch (error) {
    logWarn("Error exchanging code for tokens", { error });
    return null;
  }
}

/**
 * Store OAuth tokens for a user
 */
export async function storeOAuthTokens(
  botUserId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  scope: string
): Promise<boolean> {
  try {
    const user = await prisma.user.upsert({
      where: { botUserId },
      update: {
        provider: "gmail",
        updatedAt: new Date(),
      },
      create: {
        botUserId,
        provider: "gmail",
      },
    });

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.oAuthToken.upsert({
      where: { userId: user.id },
      update: {
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
      },
    });

    logInfo("Stored OAuth tokens", { botUserId, userId: user.id });
    return true;
  } catch (error) {
    logWarn("Failed to store OAuth tokens", { error, botUserId });
    return false;
  }
}

