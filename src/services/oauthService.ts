import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { logInfo, logWarn } from "../logger.js";

const prisma = new PrismaClient();

/**
 * Generate a unique state token for OAuth CSRF protection
 */
export function generateStateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Create and store an OAuth state token
 */
export async function createOAuthState(botUserId: string): Promise<string> {
  const stateToken = generateStateToken();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  try {
    await prisma.oAuthState.create({
      data: {
        stateToken,
        botUserId,
        expiresAt,
      },
    });

    logInfo("Created OAuth state", { botUserId, stateToken: stateToken.substring(0, 8) + "..." });
    return stateToken;
  } catch (error) {
    logWarn("Failed to create OAuth state", { error, botUserId });
    throw error;
  }
}

/**
 * Validate and retrieve OAuth state
 */
export async function validateOAuthState(stateToken: string): Promise<string | null> {
  try {
    const state = await prisma.oAuthState.findUnique({
      where: { stateToken },
    });

    if (!state) {
      logWarn("OAuth state not found", { stateToken: stateToken.substring(0, 8) + "..." });
      return null;
    }

    if (state.expiresAt < new Date()) {
      logWarn("OAuth state expired", { stateToken: stateToken.substring(0, 8) + "..." });
      await prisma.oAuthState.delete({ where: { id: state.id } });
      return null;
    }

    return state.botUserId;
  } catch (error) {
    logWarn("Failed to validate OAuth state", { error, stateToken: stateToken.substring(0, 8) + "..." });
    return null;
  }
}

/**
 * Delete OAuth state after use
 */
export async function deleteOAuthState(stateToken: string): Promise<void> {
  try {
    await prisma.oAuthState.deleteMany({
      where: { stateToken },
    });
  } catch (error) {
    logWarn("Failed to delete OAuth state", { error, stateToken: stateToken.substring(0, 8) + "..." });
  }
}

/**
 * Generate Gmail OAuth authorization URL
 */
export function generateGmailOAuthUrl(stateToken: string, redirectUri: string, clientId: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state: stateToken,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

