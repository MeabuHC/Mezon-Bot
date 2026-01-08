import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder } from "mezon-sdk";
import { sendUserEmail } from "../services/emailService.js";

function parseSendMailArgs(text: string): { to: string; subject: string; body: string } | null {
    const trimmed = text.trim();
    const [command, ...restParts] = trimmed.split(/\s+/);
    const rest = restParts.join(" ").trim();

    if (!rest) {
        return null;
    }

    const segments = rest.split("|").map((s) => s.trim());
    if (segments.length < 3) {
        return null;
    }

    const [to, subject, body] = segments;
    if (!to || !subject || !body) {
        return null;
    }

    return { to, subject, body };
}

export const runSendMail: CommandHandler = async (client, event) => {
    const text = event.content?.t ?? "";

    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for sendMail DM", { sender: event.sender_id });
            return;
        }

        const args = parseSendMailArgs(text);

        if (!args) {
            const embed = new InteractiveBuilder("✉️ Send Email")
                .setDescription(
                    "Use this command to send an email from your connected Gmail account."
                )
                .addField(
                    "Step 1",
                    "Make sure you have connected Gmail using `*login`.",
                    false
                )
                .addField(
                    "Step 2",
                    "Use the following template (copy, replace values, then send):\n\n" +
                    "`*sendMail recipient@example.com | Subject line | Email body text`",
                    false
                )
                .addField(
                    "Example",
                    "`*sendMail user@gmail.com | Hello from Mailzon | This is a test email sent from the bot.`",
                    false
                )
                .build();

            await user.sendDM({
                embed: [embed],
            });

            logInfo("Sent sendMail template to user", {
                channel_id: event.channel_id,
                sender_id: event.sender_id,
            });
            return;
        }

        const { to, subject, body } = args;

        const result = await sendUserEmail(event.sender_id, to, subject, body);

        if (result.success) {
            await user.sendDM({
                t: `✅ Email sent successfully to ${to}!`,
            });
            logInfo("sendMail command executed successfully", {
                channel_id: event.channel_id,
                sender_id: event.sender_id,
                to,
            });
            return;
        }

        // If Gmail API is disabled for the project, include activation URL in DM
        if (result.activationUrl) {
            await user.sendDM({
                t: `❌ Gmail API is disabled for the Google Cloud project used by this bot. Please enable it here and try again:\n${result.activationUrl}`,
            });
            logWarn("sendMail command failed - Gmail API disabled", {
                channel_id: event.channel_id,
                sender_id: event.sender_id,
                to,
                activationUrl: result.activationUrl,
            });
            return;
        }

        await user.sendDM({
            t: "❌ Failed to send email. Please make sure you have connected Gmail using `*login` and try again.",
        });
        logWarn("sendMail command failed to send email", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
            to,
            error: result.error,
        });
    } catch (error) {
        logWarn("Failed to execute sendMail command", {
            error,
            channel_id: event.channel_id,
        });
    }
};
