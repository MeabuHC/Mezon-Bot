import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";

const prisma = new PrismaClient();

function buildRawEmail(to: string, subject: string, body: string): string {
    const messageLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=\"UTF-8\"",
        "",
        body,
    ];

    const message = messageLines.join("\r\n");
    return Buffer.from(message).toString("base64url");
}

export type SendEmailResult = {
    success: boolean;
    status?: number;
    error?: unknown;
    activationUrl?: string;
    message?: string;
};

export async function sendUserEmail(
    botUserId: string,
    to: string,
    subject: string,
    body: string
): Promise<SendEmailResult> {
    try {
        const user = await prisma.user.findUnique({
            where: { botUserId },
            include: { oauthToken: true },
        });

        if (!user || !user.oauthToken) {
            logWarn("No OAuth token found for user when sending email", { botUserId });
            return { success: false, message: "No OAuth token found for user" };
        }

        const raw = buildRawEmail(to, subject, body);

        const response = await fetch(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${user.oauthToken.accessToken}`,
                },
                body: JSON.stringify({ raw }),
            }
        );

        if (!response.ok) {
            let parsed: any = null;
            try {
                parsed = await response.json();
            } catch (e) {
                // ignore
            }

            const result: SendEmailResult = {
                success: false,
                status: response.status,
                error: parsed ?? (await response.text()),
            };

            try {
                const details = parsed?.error?.details;
                if (Array.isArray(details)) {
                    for (const d of details) {
                        if (d?.['@type']?.includes("ErrorInfo") && d?.metadata?.activationUrl) {
                            result.activationUrl = d.metadata.activationUrl;
                            break;
                        }
                        if (d?.metadata?.activationUrl) {
                            result.activationUrl = d.metadata.activationUrl;
                            break;
                        }
                    }
                }
            } catch (e) {
                // ignore parsing details
            }

            logWarn("Failed to send Gmail message", {
                botUserId,
                status: response.status,
                error: result.error,
                activationUrl: result.activationUrl,
            });

            return result;
        }

        logInfo("Sent Gmail message successfully", { botUserId, to });
        return { success: true };
    } catch (error) {
        logWarn("Error while sending Gmail message", { botUserId, error });
        return { success: false, error };
    }
}
