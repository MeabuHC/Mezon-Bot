import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";
import { env } from "../config/env.js";

const prisma = new PrismaClient();

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(botUserId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user || !user.oauthToken) {
      logWarn("No OAuth token found", { botUserId });
      return null;
    }

    // Check if token is expired or expires soon (within 5 minutes)
    const now = new Date();
    const expiresAt = user.oauthToken.expiresAt;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const isExpired = expiresAt.getTime() - bufferTime < now.getTime();

    if (!isExpired) {
      // Token is still valid
      return user.oauthToken.accessToken;
    }

    // Token expired or expiring soon, refresh it
    logInfo("Token expired or expiring soon, refreshing", {
      botUserId,
      expiresAt: expiresAt.toISOString(),
    });

    return await refreshAccessToken(botUserId, user.oauthToken.refreshToken);
  } catch (error) {
    logWarn("Error getting valid access token", { error, botUserId });
    return null;
  }
}

/**
 * Refresh an access token using the refresh token
 */
async function refreshAccessToken(botUserId: string, refreshToken: string): Promise<string | null> {
  if (!env.googleClientId || !env.googleClientSecret) {
    logWarn("OAuth credentials not configured for token refresh");
    return null;
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWarn("Failed to refresh access token", {
        botUserId,
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Get user to find the token
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: { oauthToken: true },
    });

    if (!user || !user.oauthToken) {
      logWarn("User or OAuth token not found for token refresh", { botUserId });
      return null;
    }

    // Update stored token
    await prisma.oAuthToken.update({
      where: { userId: user.id },
      data: {
        accessToken: newAccessToken,
        expiresAt,
        lastRefreshed: new Date(),
        updatedAt: new Date(),
      },
    });

    logInfo("Successfully refreshed access token", { botUserId });
    return newAccessToken;
  } catch (error) {
    logWarn("Error refreshing access token", { error, botUserId });
    return null;
  }
}

