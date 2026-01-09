import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { EButtonMessageStyle, EMessageComponentType, InteractiveBuilder } from "mezon-sdk";

// Prefixes used for send/cancel buttons so we can route clicks in handler
export const SEND_MAIL_BUTTON_ID_PREFIX = "send_mail_submit_";
export const CANCEL_SEND_MAIL_BUTTON_ID_PREFIX = "send_mail_cancel_";

export const runSendMail: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for sendMail DM", { sender: event.sender_id });
            return;
        }

        const form = new InteractiveBuilder("✉️ Send Email")
            .setDescription(
                "Fill in the fields below and press Send to send an email from your connected Gmail account."
            )
            .addInputField("to", "To", "recipient@example.com")
            .addInputField("subject", "Subject", "Subject line")
            .addInputField("body", "Body", "Email body text...")
            .build();

        const baseId = `${event.sender_id}_${Date.now()}`;

        const components = [
            {
                components: [
                    {
                        id: `${SEND_MAIL_BUTTON_ID_PREFIX}${baseId}`,
                        type: EMessageComponentType.BUTTON,
                        component: {
                            label: "Send",
                            style: EButtonMessageStyle.SUCCESS,
                        },
                    },
                    {
                        id: `${CANCEL_SEND_MAIL_BUTTON_ID_PREFIX}${baseId}`,
                        type: EMessageComponentType.BUTTON,
                        component: {
                            label: "Cancel",
                            style: EButtonMessageStyle.SECONDARY,
                        },
                    },
                ],
            },
        ];

        await user.sendDM({
            embed: [form],
            components,
        });

        logInfo("Sent sendMail interactive form to user", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
        });
    } catch (error) {
        logWarn("Failed to execute sendMail command", {
            error,
            channel_id: event.channel_id,
        });
    }
};
