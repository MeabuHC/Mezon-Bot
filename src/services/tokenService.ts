import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";
import { env } from "../config/env.js";
import type { GoogleUserInfo } from "./userInfoService.js";

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
  scope: string,
  userInfo?: GoogleUserInfo | string | null
): Promise<boolean> {
  try {
    let email: string | null = null;
    let name: string | null = null;
    let picture: string | null = null;
    let verifiedEmail: boolean | null = null;

    if (typeof userInfo === "string") {
      email = userInfo;
    } else if (userInfo && typeof userInfo === "object") {
      email = userInfo.email;
      name = userInfo.name;
      picture = userInfo.picture;
      verifiedEmail = userInfo.verified_email;
    } else if (userInfo === null) {
      email = null;
    }

    const updateData: {
      provider: string;
      updatedAt: Date;
      email?: string | null;
      name?: string | null;
      picture?: string | null;
      verifiedEmail?: boolean | null;
    } = {
      provider: "gmail",
      updatedAt: new Date(),
    };

    if (email !== undefined) updateData.email = email;
    if (name !== undefined) updateData.name = name;
    if (picture !== undefined) updateData.picture = picture;
    if (verifiedEmail !== undefined) updateData.verifiedEmail = verifiedEmail;

    const user = await prisma.user.upsert({
      where: { botUserId },
      update: updateData,
      create: {
        botUserId,
        provider: "gmail",
        email: email || null,
        name: name || null,
        picture: picture || null,
        verifiedEmail: verifiedEmail ?? false,
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
        lastRefreshed: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt,
        scope,
        lastRefreshed: new Date(),
      },
    });

    logInfo("Stored OAuth tokens", {
      botUserId,
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    return true;
  } catch (error) {
    logWarn("Failed to store OAuth tokens", { error, botUserId });
    return false;
  }
}

