import { handleChannelMessage } from "../handlers/channelMessage.js";
import { handleButtonClick } from "../handlers/buttonClick.js";
import type { MezonClient } from "mezon-sdk";

export function registerEvents(client: MezonClient): void {
    client.onChannelMessage((event) => handleChannelMessage(client, event));
    client.onMessageButtonClicked((event) => handleButtonClick(client, event));
}

