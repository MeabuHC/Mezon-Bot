import type { User } from "../types/mezon.js";
import { logWarn } from "../logger.js";

export async function sendDMWithRetry(
    user: User,
    message: string,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await user.sendDM({ t: message });
            return;
        } catch (error: any) {
            const isSocketError =
                error?.message?.includes("Socket connection") ||
                error?.message?.includes("not been established");

            if (isSocketError && attempt < maxRetries) {
                logWarn(`Socket not ready, retrying DM send (attempt ${attempt}/${maxRetries})`, {
                    error: error.message,
                });
                await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
                continue;
            }
            throw error;
        }
    }
}

