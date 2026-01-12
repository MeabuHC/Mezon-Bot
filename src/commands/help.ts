import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder } from "mezon-sdk";
import { dmCommands } from "./index.js";

/**
 * Command descriptions for the help command.
 * IMPORTANT: When adding a new command, add its description here!
 * The help command will automatically include all commands from dmCommands,
 * but you need to add the description here for it to show up properly.
 */
const commandDescriptions: Record<string, string> = {
    "*login": "Connect your Gmail account for email alerts",
    "*logout": "Disconnect your Gmail account",
    "*send": "Send an email via Gmail",
    "*status": "Check your connected Gmail account and connection status",
    "*inbox": "Show a preview list of your latest inbox emails",
    "*view": "View full details of a specific email by its index number",
    "*subscribe": "Enable real-time email notifications",
    "*unsubscribe": "Disable email notifications",
    "*filter": "Manage include/exclude regex filters for new email notifications",
    "*ping": "Check if the bot is online and working",
    "*help": "Show this help message",
};

/**
 * Detailed help information for each command (like man pages)
 */
interface CommandHelp {
    name: string;
    description: string;
    usage: string;
    parameters?: Array<{ name: string; description: string; optional?: boolean }>;
    examples: string[];
    notes?: string[];
}

const detailedCommandHelp: Record<string, CommandHelp> = {
    "*inbox": {
        name: "inbox",
        description: "Display a paginated list of emails from your Gmail labels with optional filtering",
        usage: "*inbox [label] [filter] [page]",
        parameters: [
            {
                name: "label",
                description: "Label to view: inbox, sent, drafts, spam, trash, starred (default: inbox).",
                optional: true,
            },
            {
                name: "filter",
                description: "Gmail search query to filter emails (e.g., 'from:example@gmail.com', 'subject:keyword', 'after:2024/1/1').",
                optional: true,
            },
            {
                name: "page",
                description: "Page number to display (default: 1). Shows 25 emails per page.",
                optional: true,
            },
        ],
        examples: [
            "*inbox",
            "*inbox 1",
            "*inbox sent",
            "*inbox from:example@gmail.com",
            "*inbox sent from:boss@company.com 2",
            "*inbox subject:meeting",
            "*inbox after:2024/1/1",
            "*inbox before:2024/12/31",
            "*inbox has:attachment",
            "*inbox is:unread",
            "*inbox starred from:friend@gmail.com",
        ],
        notes: [
            "Each page displays 25 emails",
            "Use the Previous/Next buttons to navigate between pages",
            "Shows sender name, subject, and date for each email",
            "Displays total number of emails and current page information",
            "Use `*view <index>` to view full details of a specific email",
            "Available labels: inbox, sent, drafts, spam, trash, starred",
            "Filter examples: from:email, subject:text, after:2024/1/1, before:2024/12/31, has:attachment, is:unread, is:read",
            "You can combine multiple filters: 'from:example@gmail.com subject:meeting'",
        ],
    },
    "*view": {
        name: "view",
        description: "View full details of a specific email from any label with optional filtering",
        usage: "*view [label] [filter] <index>",
        parameters: [
            {
                name: "label",
                description: "Label to view: inbox, sent, drafts, spam, trash, starred (default: inbox).",
                optional: true,
            },
            {
                name: "filter",
                description: "Gmail search query to filter emails (e.g., 'from:example@gmail.com', 'subject:keyword').",
                optional: true,
            },
            {
                name: "index",
                description: "The number of the email from the list (e.g., 1, 2, 3, etc.)",
                optional: false,
            },
        ],
        examples: [
            "*view 5",
            "*view sent 3",
            "*view from:example@gmail.com 2",
            "*view sent from:boss@company.com 1",
            "*view starred 10",
        ],
        notes: [
            "Use the index number shown in `*inbox [label] [filter]` command",
            "Shows full email content including body, sender, subject, and date",
            "HTML tags are automatically removed for better readability",
            "If email is not found, it may have been deleted or moved",
            "Label and filter must match what you used in `*inbox` to get the correct index",
        ],
    },
    "*login": {
        name: "login",
        description: "Connect your Gmail account to enable email alerts and access Gmail features",
        usage: "*login",
        examples: [
            "*login",
        ],
        notes: [
            "Opens a browser window for Google OAuth authorization",
            "You'll be redirected back after authorizing",
            "After login, you'll automatically receive email notifications",
            "Only one Gmail account can be connected at a time",
        ],
    },
    "*logout": {
        name: "logout",
        description: "Disconnect your Gmail account and remove all stored data",
        usage: "*logout",
        examples: [
            "*logout",
        ],
        notes: [
            "Removes all OAuth tokens and user data from the database",
            "Stops all email notifications",
            "You can reconnect anytime using *login",
        ],
    },
    "*status": {
        name: "status",
        description: "Display your Gmail account connection status and email statistics",
        usage: "*status",
        examples: [
            "*status",
        ],
        notes: [
            "Shows connected email address and account information",
            "Displays email counts for Inbox, Sent, Drafts, and other labels",
            "Shows unread and total counts for each label",
            "Displays connection date and permissions",
        ],
    },
    "*send": {
        name: "send",
        description: "Send an email through your connected Gmail account",
        usage: "*send [email]",
        parameters: [
            {
                name: "email",
                description: "Recipient email address (optional). If provided, the 'To' field will be pre-filled.",
                optional: true,
            },
        ],
        examples: [
            "*send",
            "*send recipient@example.com",
        ],
        notes: [
            "Opens an interactive form to compose an email",
            "Requires: recipient email, subject, and body",
            "Uses your connected Gmail account to send",
            "You can cancel at any time",
            "You can pre-fill the recipient by typing: *send <email>",
        ],
    },
    "*filter": {
        name: "filter",
        description: "Manage per-user include/exclude regex filters applied to the email Sender (From header).",
        usage: "*filter add|list|remove ...",
        parameters: [
            { name: "add", description: "Add a new filter: `*filter add include|exclude <regex>`", optional: false },
            { name: "list", description: "List existing filters and their indexes: `*filter list`", optional: false },
            { name: "remove", description: "Remove a filter by index: `*filter remove include|exclude <index>`", optional: false },
        ],
        examples: [
            "*filter add include ^noreply@",
            "*filter add exclude @spamdomain\\.com$",
            "*filter list",
            "*filter remove exclude 0",
        ],
        notes: [
            "Patterns are JavaScript regular expressions (provide the pattern only, without / / delimiters).",
            "Matching is case-insensitive. Escape special regex characters when needed (e.g. use `\\.` for literal dot).",
            "Filters are tested against the email 'From' header (sender).",
            "If any active subscription has include patterns, at least one include must match (and not be excluded) to allow the email.",
            "If no include patterns exist, emails are allowed unless an exclude pattern matches.",
            "Use `*filter list` to see pattern indexes, then `*filter remove ...` to delete by index.",
            "Invalid regex patterns are ignored and logged; check your pattern syntax if it doesn't behave as expected.",
        ],
    },
    "*subscribe": {
        name: "subscribe",
        description: "Enable real-time email notifications",
        usage: "*subscribe",
        examples: [
            "*subscribe",
        ],
        notes: [
            "Enables automatic notifications for new emails",
            "Notifications are sent as soon as new emails arrive",
            "Works with both push notifications and polling",
        ],
    },
    "*unsubscribe": {
        name: "unsubscribe",
        description: "Disable email notifications",
        usage: "*unsubscribe",
        examples: [
            "*unsubscribe",
        ],
        notes: [
            "Stops all email notifications",
            "Your account remains connected",
            "You can re-enable notifications with *subscribe",
        ],
    },
    "*ping": {
        name: "ping",
        description: "Check if the bot is online and responding",
        usage: "*ping",
        examples: [
            "*ping",
        ],
        notes: [
            "Simple command to verify the bot is working",
            "Returns a pong message if the bot is online",
        ],
    },
    "*help": {
        name: "help",
        description: "Display help information for commands",
        usage: "*help [command]",
        parameters: [
            {
                name: "command",
                description: "Command name to get detailed help (optional). If omitted, shows all commands.",
                optional: true,
            },
        ],
        examples: [
            "*help",
            "*help inbox",
            "*help status",
            "*help login",
        ],
        notes: [
            "Use *help without arguments to see all available commands",
            "Use *help <command> to get detailed information about a specific command",
        ],
    },
};

export const runHelp: CommandHandler = async (client, event) => {
    try {
        const user = await client.users.fetch(event.sender_id);

        if (!user) {
            logWarn("Could not resolve user for DM", { sender: event.sender_id });
            return;
        }

        const text = event.content?.t || "";
        const parts = text.trim().split(/\s+/);
        const commandArg = parts[1]?.toLowerCase();

        // If a specific command is requested, show detailed help
        if (commandArg) {
            const commandKey = commandArg.startsWith("*") ? commandArg : `*${commandArg}`;
            const help = detailedCommandHelp[commandKey];

            if (help) {
                const embedBuilder = new InteractiveBuilder(`📖 ${help.name.toUpperCase()} - Command Help`)
                    .setDescription(help.description)
                    .addField("Usage", `\`${help.usage}\``, false);

                if (help.parameters && help.parameters.length > 0) {
                    help.parameters.forEach((param, index) => {
                        const optional = param.optional ? " (optional)" : "";
                        const paramText = `**${param.name}**${optional}\n${param.description}`;
                        embedBuilder.addField(
                            index === 0 ? "Parameters" : `\u200b`, // Use zero-width space for subsequent fields
                            paramText,
                            false
                        );
                    });
                }

                if (help.examples && help.examples.length > 0) {
                    help.examples.forEach((ex, index) => {
                        embedBuilder.addField(
                            index === 0 ? "Examples" : `\u200b`, // Use zero-width space for subsequent fields
                            `\`${ex}\``,
                            false
                        );
                    });
                }

                if (help.notes && help.notes.length > 0) {
                    help.notes.forEach((note, index) => {
                        embedBuilder.addField(
                            index === 0 ? "Notes" : `\u200b`, // Use zero-width space for subsequent fields
                            `- ${note}`,
                            false
                        );
                    });
                }

                embedBuilder.addField(
                    "More Commands",
                    "Use `*help` to see all available commands.",
                    false
                );

                const embed = embedBuilder.build();

                try {
                    await user.sendDM({ embed: [embed] });
                    logInfo("Detailed help command executed", {
                        channel_id: event.channel_id,
                        sender_id: event.sender_id,
                        command: commandKey,
                    });
                    return;
                } catch (error: any) {
                    logWarn("Failed to send detailed help", { error, command: commandKey });
                }
            } else {
                // Command not found
                const embed = new InteractiveBuilder("❌ Command Not Found")
                    .setDescription(`No help available for \`${commandArg}\``)
                    .addField("Available Commands", "Use `*help` to see all available commands.", false)
                    .build();

                await user.sendDM({ embed: [embed] });
                return;
            }
        }

        // Show general help (all commands)
        const embedBuilder = new InteractiveBuilder("📚 Mailzon Commands")
            .setDescription("Available commands for Mailzon email alert bot");

        // Dynamically add all commands from the registry
        const sortedCommands = Object.keys(dmCommands).sort();
        for (const command of sortedCommands) {
            const description = commandDescriptions[command] || "No description available";
            embedBuilder.addField(`\`${command}\``, description, false);
        }

        embedBuilder
            .addField("How to use", "Send commands in a direct message (DM) to Mailzon. All commands start with `*`.", false)
            .addField("Detailed Help", "Use `*help <command>` to get detailed information about a specific command.\nExample: `*help inbox`", false)
            .addField("Email Alerts", "After logging in with `*login`, you'll automatically receive notifications when new emails arrive in your inbox. Use `*subscribe` and `*unsubscribe` to control notifications.", false);

        const embed = embedBuilder.build();

        let lastError: any = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                await user.sendDM({
                    embed: [embed],
                });
                logInfo("Help command executed", {
                    channel_id: event.channel_id,
                    sender_id: event.sender_id,
                });
                return;
            } catch (error: any) {
                lastError = error;
                const errorMessage = typeof error === "string" ? error : error?.message || String(error);
                const isSocketError =
                    errorMessage.includes("Socket connection") ||
                    errorMessage.includes("not been established");

                if (isSocketError && attempt < 3) {
                    logWarn(`Socket not ready, retrying help command (attempt ${attempt}/3)`, {
                        error: errorMessage,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
                    continue;
                }

                if (!isSocketError || attempt === 3) {
                    throw error;
                }
            }
        }

        logInfo("Help command executed", {
            channel_id: event.channel_id,
            sender_id: event.sender_id,
        });
    } catch (error) {
        logWarn("Failed to execute help command", {
            error,
            channel_id: event.channel_id,
        });
    }
};

