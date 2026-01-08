import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { disconnectOAuthTokens } from "../services/userService.js";
import { InteractiveBuilder } from "mezon-sdk";

export const runLogout: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for DM", { sender: event.sender_id });
            return;
        }

        const disconnected = await disconnectOAuthTokens(event.sender_id);

        if (disconnected) {
            const embed = new InteractiveBuilder("🔓 Disconnected")
                .setDescription("✅ Your Gmail account has been disconnected successfully.")
                .addField("Next steps", "You can run `*login` again to connect a different account.", false)
                .build();

            await user.sendDM({
                embed: [embed],
            });

            logInfo("User disconnected OAuth tokens", {
                channel_id: event.channel_id,
                sender_id: event.sender_id,
            });
        } else {
            const embed = new InteractiveBuilder("🔓 Not Connected")
                .setDescription("❌ You don't have a Gmail account connected.")
                .addField("Connect your account", "Run `*login` to connect your Gmail account.", false)
                .build();

            await user.sendDM({
                embed: [embed],
            });

            logInfo("User tried to logout but had no tokens", {
                channel_id: event.channel_id,
                sender_id: event.sender_id,
            });
        }
    } catch (error) {
        logWarn("Failed to execute logout command", {
            error,
            channel_id: event.channel_id,
        });

        try {
            const user = await client.users.fetch(event.sender_id);
            if (user) {
                await user.sendDM({
                    t: "❌ Failed to disconnect. Please try again later.",
                });
            }
        } catch (sendError) {
            logWarn("Failed to send error message", { error: sendError });
        }
    }
};

