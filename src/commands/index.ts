import type { CommandHandler } from "../types/mezon.js";
import { runLogin } from "./login.js";
import { runHelp } from "./help.js";
import { runSendMail } from "./sendMail.js";
import { runLogout } from "./logout.js";
import { handleSubscribe, handleUnsubscribe, handleSubscriptionStatus } from "./subscribe.js";
import { runStatus } from "./status.js";
import { runListMail } from "./listMail.js";

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
    "*inbox": runListMail,
};

export function resolveDmCommand(text: string): CommandHandler | undefined {
    const trimmed = text.trim();
    const [command] = trimmed.split(/\s+/);
    return dmCommands[command];
}

