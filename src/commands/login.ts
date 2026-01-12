import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { generateGmailOAuthUrl } from "../services/oauthService.js";
import { hasValidOAuthTokens, getUserEmail } from "../services/userService.js";
import { env } from "../config/env.js";
import { EButtonMessageStyle, EMessageComponentType, InteractiveBuilder } from "mezon-sdk";

export const runLogin: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for DM", { sender: event.sender_id });
            return;
        }

        if (!env.googleClientId || !env.oauthRedirectUri) {
            await user.sendDM({
                t: "❌ OAuth is not configured. Please set GOOGLE_CLIENT_ID and OAUTH_REDIRECT_URI in your environment variables.",
            });
            logWarn("OAuth not configured", { sender_id: event.sender_id });
            return;
        }

        const tokenCheck = await hasValidOAuthTokens(event.sender_id);
        logInfo("Token check result", { sender_id: event.sender_id, hasTokens: tokenCheck.hasTokens, email: tokenCheck.email });

        let existingEmail: string | null = null;
        if (tokenCheck.hasTokens) {
            existingEmail = tokenCheck.email || await getUserEmail(event.sender_id);
            logInfo("User has existing tokens, allowing re-login", { sender_id: event.sender_id, email: existingEmail });
        }

        logInfo("Proceeding with OAuth flow", { sender_id: event.sender_id, hasExistingTokens: tokenCheck.hasTokens });
        const oauthUrl = generateGmailOAuthUrl(
            event.sender_id,
            env.oauthRedirectUri,
            env.googleClientId
        );

        const buttonId = `oauth_login_${event.sender_id}_${Date.now()}`;
        const components = [
            {
                components: [
                    {
                        id: buttonId,
                        type: EMessageComponentType.BUTTON,
                        component: {
                            label: "🔐 Authorize Gmail",
                            style: EButtonMessageStyle.LINK,
                            url: oauthUrl,
                        },
                    },
                ],
            },
        ];

        const embedBuilder = new InteractiveBuilder("🔐 Connect Your Gmail Account")
            .setDescription("Click the button below to authorize Mailzon to access your Gmail account for email alerts.");

        if (existingEmail) {
            embedBuilder.addField(
                "ℹ️ Re-authenticating",
                `You're currently connected as **${existingEmail}**.\n\nRe-logging in will update your permissions and can change the connected account.`,
                false
            );
        }

        const embed = embedBuilder.build();

        await user.sendDM({
            embed: [embed],
            components,
        });

        logInfo("Login command executed - OAuth URL sent", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
        });
    } catch (error) {
        logWarn("Failed to execute login command", {
            error,
            channel_id: event.channel_id,
        });

        try {
            const user = await client.users.fetch(event.sender_id);
            if (user) {
                await user.sendDM({
                    t: "❌ Failed to generate login link. Please try again later.",
                });
            }
        } catch (sendError) {
            logWarn("Failed to send error message", { error: sendError });
        }
    }
};

