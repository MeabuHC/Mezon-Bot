import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { EButtonMessageStyle, EMessageComponentType, InteractiveBuilder } from "mezon-sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const SEND_MAIL_BUTTON_ID_PREFIX = "send_mail_submit_";
export const CANCEL_SEND_MAIL_BUTTON_ID_PREFIX = "send_mail_cancel_";

export const runSend: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for send DM", { sender: event.sender_id });
            return;
        }

        const dbUser = await prisma.user.findUnique({
            where: { botUserId: String(event.sender_id) },
            include: {
                oauthToken: true,
            },
        });

        if (!dbUser || !dbUser.oauthToken) {
            const embed = new InteractiveBuilder("❌ Not Connected")
                .setDescription("Authentication required. Please login with *login command.")
                .addField(
                    "Connect your account",
                    "Run `*login` to connect your Gmail account.",
                    false
                )
                .build();

            await user.sendDM({ embed: [embed] });
            logInfo("User tried to send email - not connected", {
                sender_id: event.sender_id,
            });
            return;
        }

        const baseId = `${event.sender_id}_${Date.now()}`;
        const messageId = event.message_id || baseId;

        const text = event.content?.t || "";
        const parts = text.trim().split(/\s+/);
        const emailParam = parts[1]; // Get the email after *send

        const form = [
            {
                color: "5865f2", // Discord blue color
                title: "✉️ Send Email",
                description: "Fill in the fields below and press Send to send an email from your connected Gmail account.",
                fields: [
                    {
                        name: "To:",
                        value: "",
                        inputs: {
                            id: `send-${messageId}-to`,
                            type: EMessageComponentType.INPUT,
                            component: {
                                id: `send-${messageId}-to-plhder`,
                                placeholder: "recipient@example.com",
                                required: true,
                                defaultValue: emailParam || "", // Pre-fill with parameter if provided
                            },
                        },
                    },
                    {
                        name: "Subject:",
                        value: "",
                        inputs: {
                            id: `send-${messageId}-subject`,
                            type: EMessageComponentType.INPUT,
                            component: {
                                id: `send-${messageId}-subject-plhder`,
                                placeholder: "Subject line",
                                required: true,
                            },
                        },
                    },
                    {
                        name: "Body:",
                        value: "",
                        inputs: {
                            id: `send-${messageId}-body`,
                            type: EMessageComponentType.INPUT,
                            component: {
                                id: `send-${messageId}-body-plhder`,
                                placeholder: "Email body text...",
                                required: true,
                                textarea: true,
                            },
                        },
                    },
                ],
            },
        ];

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
            embed: form,
            components,
        });

        logInfo("Sent send interactive form to user", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
        });
    } catch (error) {
        logWarn("Failed to execute send command", {
            error,
            channel_id: event.channel_id,
        });
    }
};

