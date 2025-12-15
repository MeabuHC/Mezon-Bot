import { handleChannelMessage } from "../handlers/channelMessage.js";
import type { MezonClient } from "mezon-sdk";

export function registerEvents(client: MezonClient): void {
    client.onChannelMessage((event) => handleChannelMessage(client, event));
}

