import { PrismaClient } from "@prisma/client";
import { logWarn, logInfo } from "../logger.js";

const prisma = new PrismaClient();

/**
 * Check if user has valid OAuth tokens
 */
export async function hasValidOAuthTokens(botUserId: string): Promise<{ hasTokens: boolean; email?: string | null }> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: {
        oauthToken: true,
      },
    });

    if (!user || !user.oauthToken) {
      return { hasTokens: false };
    }

    // Check if token is expired (with some buffer - 5 minutes before actual expiry)
    const now = new Date();
    const expiresAt = user.oauthToken.expiresAt;
    const bufferTime = 5 * 60 * 1000; // 5 minutes
    const isExpired = expiresAt.getTime() - bufferTime < now.getTime();

    logInfo("Checking token validity", {
      botUserId,
      expiresAt: expiresAt.toISOString(),
      now: now.toISOString(),
      isExpired,
      hasTokens: !isExpired,
    });

    if (isExpired) {
      return { hasTokens: false, email: user.email };
    }

    return { hasTokens: true, email: user.email };
  } catch (error) {
    logWarn("Failed to check OAuth tokens", { error, botUserId });
    return { hasTokens: false };
  }
}

/**
 * Get user's email from database
 */
export async function getUserEmail(botUserId: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      select: { email: true },
    });

    return user?.email || null;
  } catch (error) {
    logWarn("Failed to get user email", { error, botUserId });
    return null;
  }
}

/**
 * Disconnect OAuth tokens for a user
 */
export async function disconnectOAuthTokens(botUserId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { botUserId },
      include: {
        oauthToken: true,
      },
    });

    if (!user || !user.oauthToken) {
      return false;
    }

    // Delete OAuth tokens
    await prisma.oAuthToken.delete({
      where: { userId: user.id },
    });

    // Optionally clear email (or keep it for reference)
    // For now, we'll keep the email but clear the tokens

    logInfo("Disconnected OAuth tokens", { botUserId, userId: user.id });
    return true;
  } catch (error) {
    logWarn("Failed to disconnect OAuth tokens", { error, botUserId });
    return false;
  }
}

