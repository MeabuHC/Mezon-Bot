import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { EButtonMessageStyle, EMessageComponentType } from "mezon-sdk";

const DEMO_BUTTON_ID = "demo_button";

export const runButton: CommandHandler = async (client, event) => {
  try {
    const channel = await client.channels.fetch(event.channel_id);

    const components = [
      {
        components: [
          {
            id: `${DEMO_BUTTON_ID}_A_${event.sender_id}_${event.clan_id ?? "0"}_${event.mode ?? 0}_${event.is_public ?? false}_${event.channel_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: "Click A",
              style: EButtonMessageStyle.PRIMARY,
            },
          },
          {
            id: `${DEMO_BUTTON_ID}_B_${event.sender_id}_${event.clan_id ?? "0"}_${event.mode ?? 0}_${event.is_public ?? false}_${event.channel_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: "Click B",
              style: EButtonMessageStyle.SECONDARY,
            },
          },
        ],
      },
    ];

    await channel.send({
      t: "Button demo (A/B): click below",
      components,
    });
    logInfo("Sent button demo", { channel_id: event.channel_id, components });
  } catch (error) {
    logWarn("Failed to send button demo", { error, channel_id: event.channel_id });
  }
};

export { DEMO_BUTTON_ID };

