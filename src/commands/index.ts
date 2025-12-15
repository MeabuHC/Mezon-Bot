import { runPing } from "./ping.js";
import type { MezonClient } from "mezon-sdk";

type CommandHandler = (client: MezonClient, event: any) => Promise<void>;

const commands: Record<string, CommandHandler> = {
    "*ping": runPing,
};

export function resolveCommand(text: string): CommandHandler | undefined {
    return commands[text];
}

