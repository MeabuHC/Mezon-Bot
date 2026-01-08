import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { createOAuthState, generateGmailOAuthUrl } from "../services/oauthService.js";
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

        const stateToken = await createOAuthState(event.sender_id);
        const oauthUrl = generateGmailOAuthUrl(
            stateToken,
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

        const embed = new InteractiveBuilder("🔐 Connect Your Gmail Account")
            .setDescription("Click the button below to authorize Mailzon to access your Gmail account for email alerts.\n\n⚠️ This link expires in 10 minutes.")
            .build();

        await user.sendDM({
            embed: [embed],
            components,
        });

        logInfo("Login command executed - OAuth URL sent", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
            stateToken: stateToken.substring(0, 8) + "...",
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

