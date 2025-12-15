import { runPing } from "./ping.js";
import { runDmHello } from "./dmHello.js";
import type { CommandHandler } from "../types/mezon.js";

const commands: Record<string, CommandHandler> = {
    "*ping": runPing,
};

const dmCommands: Record<string, CommandHandler> = {
    "*dmhello": runDmHello,
};

export function resolveCommand(text: string): CommandHandler | undefined {
    return commands[text];
}

export function resolveDmCommand(text: string): CommandHandler | undefined {
    return dmCommands[text];
}

