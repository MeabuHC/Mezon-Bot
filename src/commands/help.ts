import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder } from "mezon-sdk";

export const runHelp: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for DM", { sender: event.sender_id });
            return;
        }

        const embed = new InteractiveBuilder("📚 Mailzon Commands")
            .setDescription("Available commands for Mailzon email alert bot")
            .addField(
                "Available Commands",
                "• `*login` - Connect your Gmail account for email alerts\n" +
                "• `*subscribe` - Enable email notifications\n" +
                "• `*unsubscribe` - Disable email notifications\n" +
                "• `*status` - Check your subscription status\n" +
                "• `*sendMail` - Show template and send an email from your connected Gmail account\n" +
                "• `*logout` - Disconnect your Gmail account\n" +
                "• `*help` - Show this help message",
                false
            )
            .addField("How to use", "Send commands in a direct message (DM) to Mailzon. All commands start with `*`.", false)
            .addField("Email Notifications", "After logging in, you'll automatically be subscribed to email alerts. When a new email arrives, you'll receive a notification with a button to view the full content.", false)
            .addField("Need help?", "If you encounter any issues, please contact support.", false)
            .build();

        let lastError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await user.sendDM({
                    embed: [embed],
                });
                logInfo("Help command executed", {
                    channel_id: event.channel_id,
                    sender_id: event.sender_id,
                });
                return;
            } catch (error: any) {
                lastError = error;
                const errorMessage = typeof error === "string" ? error : error?.message || String(error);
                const isSocketError =
                    errorMessage.includes("Socket connection") ||
                    errorMessage.includes("not been established");

                if (isSocketError && attempt < 3) {
                    logWarn(`Socket not ready, retrying help command (attempt ${attempt}/3)`, {
                        error: errorMessage,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                    continue;
                }

                if (!isSocketError || attempt === 3) {
                    throw error;
                }
            }
        }

        logInfo("Help command executed", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
        });
    } catch (error) {
        logWarn("Failed to execute help command", {
            error,
            channel_id: event.channel_id,
        });
    }
};

