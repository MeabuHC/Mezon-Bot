import type { CommandHandler } from "../types/mezon.js";

export const runDmHello: CommandHandler = async (client, event) => {
  const user = await client.users.fetch(event.sender_id);
  if (!user) return;
  await user.sendDM({ t: "Hello from DM command" });
};

