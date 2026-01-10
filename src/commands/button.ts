import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder, EButtonMessageStyle, EMessageComponentType } from "mezon-sdk";

export const runButton: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);

    if (!user) {
      logWarn("Could not resolve user for button command", { sender: event.sender_id });
      return;
    }

    // Create embed with boilerplate text
    const embed = new InteractiveBuilder("🔘 Button Test")
      .setDescription("This is a test button. Click it to see a message!")
      .addField("Instructions", "Click the button below to print 'hello world'", false)
      .build();

    // Create button component
    const components = [
      {
        components: [
          {
            id: `button_test_${event.sender_id}`,
            type: EMessageComponentType.BUTTON,
            component: {
              label: "Click Me!",
              style: EButtonMessageStyle.PRIMARY,
            },
          },
        ],
      },
    ];

    await user.sendDM({
      embed: [embed],
      components,
    });

    logInfo("Button command executed", {
      sender_id: event.sender_id,
    });
  } catch (error) {
    logWarn("Failed to execute button command", {
      error,
      sender_id: event.sender_id,
    });
  }
};

