import type { CommandHandler } from "../types/mezon.js";
import { runButton } from "./button.js";
import { runLogin } from "./login.js";
import { runHelp } from "./help.js";
import { runSendMail } from "./sendMail.js";
import { runLogout } from "./logout.js";

const commands: Record<string, CommandHandler> = {
    "*button": runButton,
};

const dmCommands: Record<string, CommandHandler> = {
    "*login": runLogin,
    "*help": runHelp,
    "*sendMail": runSendMail,
    "*logout": runLogout,
};

export function resolveCommand(text: string): CommandHandler | undefined {
    return commands[text];
}

export function resolveDmCommand(text: string): CommandHandler | undefined {
    const trimmed = text.trim();
    const [command] = trimmed.split(/\s+/);
    return dmCommands[command];
}

