import { MezonClient, ChannelMessage } from "mezon-sdk";

export type { Message } from "mezon-sdk/dist/cjs/mezon-client/structures/Message.js";
export type { TextChannel } from "mezon-sdk/dist/cjs/mezon-client/structures/TextChannel.js";
export type { User } from "mezon-sdk/dist/cjs/mezon-client/structures/User.js";

export type CommandHandler = (
    client: MezonClient,
    event: ChannelMessage
) => Promise<void>;

