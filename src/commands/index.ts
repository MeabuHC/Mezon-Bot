import type { CommandHandler } from "../types/mezon.js";
import { runButton } from "./button.js";
import { runLogin } from "./login.js";
import { runHelp } from "./help.js";

const commands: Record<string, CommandHandler> = {
    "*button": runButton,
};

const dmCommands: Record<string, CommandHandler> = {
    "*login": runLogin,
    "*help": runHelp,
};

export function resolveCommand(text: string): CommandHandler | undefined {
    return commands[text];
}

export function resolveDmCommand(text: string): CommandHandler | undefined {
    return dmCommands[text];
}

