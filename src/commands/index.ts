import type { CommandHandler } from "../types/mezon.js";
import { runLogin } from "./login.js";
import { runHelp } from "./help.js";
import { runSendMail } from "./sendMail.js";
import { runLogout } from "./logout.js";
import { handleSubscribe, handleUnsubscribe, handleSubscriptionStatus } from "./subscribe.js";
import { runStatus } from "./status.js";
import { runInbox } from "./inbox.js";

export const dmCommands: Record<string, CommandHandler> = {
    "*login": runLogin,
    "*help": runHelp,
    "*sendMail": runSendMail,
    "*logout": runLogout,
    "*subscribe": async (client, event) => {
        await handleSubscribe(event.sender_id, event.channel_id, client);
    },
    "*unsubscribe": async (client, event) => {
        await handleUnsubscribe(event.sender_id, event.channel_id, client);
    },
    "*status": runStatus,
    "*inbox": runInbox,
};

export function resolveDmCommand(text: string): CommandHandler | undefined {
    const trimmed = text.trim();
    const [command] = trimmed.split(/\s+/);
    // Case-insensitive lookup
    const lowerCommand = command.toLowerCase();
    return dmCommands[lowerCommand] || dmCommands[command];
}

