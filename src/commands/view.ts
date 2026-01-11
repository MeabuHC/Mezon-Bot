import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { PrismaClient } from "@prisma/client";
import { getInboxMessageSummaries } from "../services/gmailService.js";
import { fetchEmailById } from "../services/gmailFetchService.js";
import { InteractiveBuilder, EMessageComponentType, EButtonMessageStyle } from "mezon-sdk";
import { decodeHtmlEntities } from "../utils/htmlDecode.js";

const prisma = new PrismaClient();

export const runView: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);
    if (!user) {
      logWarn("Could not resolve user for view command", { sender: event.sender_id });
      return;
    }

    // Check if user has a connected Gmail account
    const dbUser = await prisma.user.findUnique({
      where: { botUserId: String(event.sender_id) },
      include: {
        oauthToken: true,
      },
    });

    if (!dbUser || !dbUser.oauthToken) {
      const embed = new InteractiveBuilder("❌ Not Connected")
        .setDescription("You don't have a Gmail account connected.")
        .addField(
          "Connect your account",
          "Run `*login` to connect your Gmail account.",
          false
        )
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    // Parse label, filter, and index parameters
    // Format: *view [label] [filter] <index> or *view <index> [label] [filter]
    const text = event.content?.t || "";
    const parts = text.trim().split(/\s+/);

    let labelId = "INBOX";
    let query: string | undefined;
    let index: number | undefined;

    const labelMap: Record<string, string> = {
      inbox: "INBOX",
      sent: "SENT",
      drafts: "DRAFT",
      draft: "DRAFT",
      spam: "SPAM",
      trash: "TRASH",
      starred: "STARRED",
      star: "STARRED",
    };

    // Find the index (first number that looks like an index)
    let indexArg: string | undefined;
    let indexPosition = -1;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const num = parseInt(part, 10);
      if (Number.isFinite(num) && num > 0 && num < 10000) {
        indexArg = part;
        indexPosition = i;
        index = num;
        break;
      }
    }

    if (!indexArg || !index) {
      const embed = new InteractiveBuilder("❌ Missing Index")
        .setDescription("Please specify which email to view.")
        .addField(
          "Usage",
          "`*view [label] [filter] <index>`\n\nExamples:\n- `*view 5` - View 5th email from inbox\n- `*view sent 3` - View 3rd email from sent\n- `*view from:example@gmail.com 2` - View 2nd email from filtered inbox",
          false
        )
        .addField(
          "How to find the index",
          "Run `*inbox [label] [filter]` to see the list of emails. Each email has a number (1, 2, 3, etc.). Use that number with `*view`.",
          false
        )
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    // Parse label and filter from parts before the index
    for (let i = 1; i < indexPosition; i++) {
      const part = parts[i];

      // Check if it's a label
      if (labelMap[part.toLowerCase()]) {
        labelId = labelMap[part.toLowerCase()];
        continue;
      }

      // Check if it's a filter keyword
      const filterKeywords = ["from:", "subject:", "after:", "before:", "has:", "is:", "in:", "label:"];
      if (filterKeywords.some(keyword => part.toLowerCase().startsWith(keyword))) {
        // Collect all filter parts until index
        const filterParts: string[] = [];
        while (i < indexPosition) {
          filterParts.push(parts[i]);
          i++;
        }
        query = filterParts.join(" ");
        break;
      }
    }

    // Send loading message immediately (before any fetching)
    await user.sendDM({
      t: "⏳ Loading email...",
    });

    // Calculate which page the email is on (25 emails per page)
    const pageSize = 25;
    const page = Math.ceil(index / pageSize);
    const positionInPage = ((index - 1) % pageSize) + 1;

    // Fetch the page with label and filter
    const inboxPage = await getInboxMessageSummaries(
      event.sender_id,
      pageSize,
      page,
      labelId,
      query
    );

    if (!inboxPage || inboxPage.summaries.length === 0) {
      const embed = new InteractiveBuilder("❌ Email Not Found")
        .setDescription(`Email #${index} not found. It may have been deleted or moved.`)
        .addField("Tip", "Run `*inbox` to see the current list of emails.", false)
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    // Get the email at the specified position
    const emailSummary = inboxPage.summaries[positionInPage - 1];
    if (!emailSummary) {
      const embed = new InteractiveBuilder("❌ Email Not Found")
        .setDescription(`Email #${index} not found on page ${page}.`)
        .addField("Tip", "Run `*inbox` to see the current list of emails.", false)
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    // Fetch full email details
    const email = await fetchEmailById(event.sender_id, emailSummary.id);

    if (!email) {
      const embed = new InteractiveBuilder("❌ Error")
        .setDescription("Unable to fetch email details. It may have been deleted or moved.")
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    // Clean up HTML tags and format body
    let cleanBody = email.body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove <style> tags and their content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove <script> tags and their content
      .replace(/<[^>]*>/g, "") // Remove remaining HTML tags
      .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n") // Reduce multiple newlines
      .trim();

    // Decode HTML entities (e.g., &#7843; -> ả)
    cleanBody = decodeHtmlEntities(cleanBody);

    // Limit body length for embed
    const bodyPreview = cleanBody.length > 1000
      ? cleanBody.substring(0, 1000) + "\n\n... (content truncated)"
      : cleanBody;

    const embed = new InteractiveBuilder(`📧 ${email.subject || "(no subject)"}`)
      .setDescription(bodyPreview)
      .addField("From", email.from, false)
      .addField("Date", new Date(email.timestamp).toLocaleString(), false)
      .build();

    // Add action buttons
    const isStarred = email.labels.includes("STARRED");
    const isUnread = email.labels.includes("UNREAD");
    const isInTrash = email.labels.includes("TRASH");
    
    const components: any[] = [];
    const buttonRow: any[] = [];

    // Star/Unstar button
    buttonRow.push({
      id: `email_action_star_${email.id}`,
      type: EMessageComponentType.BUTTON,
      component: {
        label: isStarred ? "⭐ Unstar" : "⭐ Star",
        style: isStarred ? EButtonMessageStyle.SUCCESS : EButtonMessageStyle.SECONDARY,
      },
    });

    // Delete/Archive button (only show delete if in trash, otherwise archive)
    if (isInTrash) {
      buttonRow.push({
        id: `email_action_restore_${email.id}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "♻️ Restore",
          style: EButtonMessageStyle.SECONDARY,
        },
      });
      buttonRow.push({
        id: `email_action_delete_${email.id}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "🗑️ Delete",
          style: EButtonMessageStyle.DANGER,
        },
      });
    } else {
      buttonRow.push({
        id: `email_action_archive_${email.id}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "📦 Archive",
          style: EButtonMessageStyle.SECONDARY,
        },
      });
      buttonRow.push({
        id: `email_action_delete_${email.id}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "🗑️ Delete",
          style: EButtonMessageStyle.DANGER,
        },
      });
    }

    // Mark as Read/Unread button
    buttonRow.push({
      id: `email_action_read_${email.id}`,
      type: EMessageComponentType.BUTTON,
      component: {
        label: isUnread ? "✓ Mark Read" : "📬 Mark Unread",
        style: EButtonMessageStyle.SECONDARY,
      },
    });

    if (buttonRow.length > 0) {
      components.push({ components: buttonRow });
    }

    await user.sendDM({ 
      embed: [embed],
      components: components.length > 0 ? components : undefined,
    });

    logInfo("Email viewed via view command", {
      sender_id: event.sender_id,
      email_id: emailSummary.id,
      index,
    });
  } catch (error) {
    logWarn("Failed to execute view command", {
      error,
      channel_id: event.channel_id,
      sender_id: event.sender_id,
    });

    try {
      const user = await client.users.fetch(event.sender_id);
      if (user) {
        await user.sendDM({
          t: "❌ Failed to fetch email. Please try again later.",
        });
      }
    } catch (notifyError) {
      logWarn("Failed to notify user of view error", {
        error: notifyError,
      });
    }
  }
};


