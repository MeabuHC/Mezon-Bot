import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { PrismaClient } from "@prisma/client";
import { getInboxMessageSummaries } from "../services/gmailService.js";
import { fetchEmailById } from "../services/gmailFetchService.js";
import { InteractiveBuilder, EMessageComponentType, EButtonMessageStyle } from "mezon-sdk";

const prisma = new PrismaClient();

export const runView: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);
    if (!user) {
      logWarn("Could not resolve user for view command", { sender: event.sender_id });
      return;
    }

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

    for (let i = 1; i < indexPosition; i++) {
      const part = parts[i];

      if (labelMap[part.toLowerCase()]) {
        labelId = labelMap[part.toLowerCase()];
        continue;
      }

      const filterKeywords = ["from:", "subject:", "after:", "before:", "has:", "is:", "in:", "label:"];
      if (filterKeywords.some(keyword => part.toLowerCase().startsWith(keyword))) {
        const filterParts: string[] = [];
        while (i < indexPosition) {
          filterParts.push(parts[i]);
          i++;
        }
        query = filterParts.join(" ");
        break;
      }
    }

    await user.sendDM({
      t: "⏳ Loading email...",
    });

    const pageSize = 25;
    const page = Math.ceil(index / pageSize);
    const positionInPage = ((index - 1) % pageSize) + 1;

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

    const emailSummary = inboxPage.summaries[positionInPage - 1];
    if (!emailSummary) {
      const embed = new InteractiveBuilder("❌ Email Not Found")
        .setDescription(`Email #${index} not found on page ${page}.`)
        .addField("Tip", "Run `*inbox` to see the current list of emails.", false)
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    const email = await fetchEmailById(event.sender_id, emailSummary.id);

    if (!email) {
      const embed = new InteractiveBuilder("❌ Error")
        .setDescription("Unable to fetch email details. It may have been deleted or moved.")
        .build();

      await user.sendDM({ embed: [embed] });
      return;
    }

    let cleanBody = email.body
      .replace(/\r\n/g, "\n")
      .replace(/\n{2,}/g, "\n\n")
      .replace(/\*/g, "\\*")
      .replace(/_/g, "\\_")
      .replace(/~/g, "\\~")
      .replace(/`/g, "\\`")
      .replace(/\|/g, "\\|")
      .trim();

    const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${email.id}`;
    const title = `📧 ${email.subject || "(no subject)"}`;
    const fromField = `From: ${email.from}`;
    const dateField = `Date: ${new Date(email.timestamp).toLocaleString()}`;
    const gmailFieldText = `🔗 View in Gmail: ${gmailLink}`;

    const fixedOverhead = title.length + fromField.length + dateField.length + gmailFieldText.length + 600;
    const maxBodyLength = 7500 - fixedOverhead;

    const isTruncated = cleanBody.length > maxBodyLength;
    const bodyPreview = isTruncated
      ? cleanBody.substring(0, maxBodyLength) + "\n\n... (email too long, view in Gmail)"
      : cleanBody;

    const embed = new InteractiveBuilder(title)
      .setDescription(bodyPreview)
      .addField("From", email.from, false)
      .addField("Date", new Date(email.timestamp).toLocaleString(), false)
      .build();

    const isStarred = email.labels.includes("STARRED");
    const isUnread = email.labels.includes("UNREAD");
    const isInTrash = email.labels.includes("TRASH");

    const components: any[] = [];
    const buttonRow: any[] = [];

    buttonRow.push({
      id: `gmail_link_${email.id}`,
      type: EMessageComponentType.BUTTON,
      component: {
        label: "View in Gmail",
        url: gmailLink,
        style: EButtonMessageStyle.LINK,
      },
    });

    buttonRow.push({
      id: `email_action_star_${email.id}`,
      type: EMessageComponentType.BUTTON,
      component: {
        label: isStarred ? "⭐ Unstar" : "⭐ Star",
        style: isStarred ? EButtonMessageStyle.SUCCESS : EButtonMessageStyle.SECONDARY,
      },
    });

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


