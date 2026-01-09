import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder } from "mezon-sdk";
import { PrismaClient } from "@prisma/client";
import { sendDMWithRetry } from "../utils/sendDM.js";
import { getInboxMessageSummaries } from "../services/gmailService.js";

const prisma = new PrismaClient();

function extractSenderName(fromHeader: string): string {
  if (!fromHeader) return "Unknown sender";
  // If there's a display name part before the email, use that
  const angleIndex = fromHeader.indexOf("<");
  let display = fromHeader;
  if (angleIndex > 0) {
    display = fromHeader.slice(0, angleIndex).trim() || fromHeader;
  }

  // Strip surrounding quotes if present
  if (
    (display.startsWith('"') && display.endsWith('"')) ||
    (display.startsWith("'") && display.endsWith("'"))
  ) {
    display = display.slice(1, -1);
  }

  // Strip angle brackets if the whole thing is wrapped like <mbebanking@bank.com>
  display = display.replace(/[<>]/g, "").trim();

  // If it's still just an email address, prettify it (take local part)
  if (display.includes("@")) {
    const localPart = display.split("@")[0];
    display = localPart
      .replace(/[._]+/g, " ")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  return display || "Unknown sender";
}

function formatShortDate(dateHeader: string): string {
  if (!dateHeader) return "";
  const date = new Date(dateHeader);
  if (Number.isNaN(date.getTime())) return dateHeader;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export const runListMail: CommandHandler = async (client, event) => {
  try {
    const user = await client.users.fetch(event.sender_id);

    if (!user) {
      logWarn("Could not resolve user for listMail command", {
        sender: event.sender_id,
      });
      return;
    }

    const text = event.content?.t || "";
    const [, pageArg] = text.trim().split(/\s+/);
    let page = parseInt(pageArg || "1", 10);
    if (!Number.isFinite(page) || page < 1) {
      page = 1;
    }

    // 20 per page to keep API latency reasonable while still close to Gmail's feel
    const pageSize = 20;

    // Ensure the user has a connected Gmail account
    const dbUser = await prisma.user.findUnique({
      where: { botUserId: event.sender_id },
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
      logInfo("User tried to list emails - not connected", {
        sender_id: event.sender_id,
      });
      return;
    }

    // Fetch inbox page (headers only)
    const inboxPage = await getInboxMessageSummaries(
      event.sender_id,
      pageSize,
      page
    );

    const embedBuilder = new InteractiveBuilder("📥 Inbox")
      .setDescription("Latest emails from your Gmail inbox.");

    if (!inboxPage || inboxPage.summaries.length === 0) {
      embedBuilder.addField(
        "No emails found",
        "Your inbox appears to be empty.",
        false
      );
    } else {
      const { summaries, totalMessages, page: currentPage, pageSize } =
        inboxPage;

      const startIndex = (currentPage - 1) * pageSize + 1;
      const endIndex = startIndex + summaries.length - 1;

      embedBuilder.addField(
        "Range",
        `${startIndex}–${endIndex} of ${totalMessages.toLocaleString()}`,
        false
      );

      summaries.forEach((msg, index) => {
        const indexLabel = startIndex + index;
        const unreadTag = msg.isUnread ? "● " : ""; // bullet dot for unread
        const sender = extractSenderName(msg.from);
        const shortDate = formatShortDate(msg.date);

        // Keep the subject reasonably short
        const subject =
          msg.subject.length > 60
            ? msg.subject.slice(0, 57) + "..."
            : msg.subject;

        const title = `${indexLabel}. ${unreadTag}${sender}`;
        const valueParts = [subject];
        if (shortDate) {
          valueParts.push(shortDate);
        }

        embedBuilder.addField(title, valueParts.join(" • "), false);
      });

      // Pagination hint
      const navHints: string[] = [];
      if (currentPage > 1) {
        navHints.push(`Previous page: \`*inbox ${currentPage - 1}\``);
      }
      if (inboxPage.hasNextPage) {
        navHints.push(`Next page: \`*inbox ${currentPage + 1}\``);
      }

      if (navHints.length > 0) {
        embedBuilder.addField("Navigation", navHints.join("\n"), false);
      }
    }

    const embed = embedBuilder.build();

    await user.sendDM({ embed: [embed] });

    logInfo("listMail command executed", {
      channel_id: event.channel_id,
      sender_id: event.sender_id,
    });
  } catch (error) {
    logWarn("Failed to execute listMail command", {
      error,
      channel_id: event.channel_id,
      sender_id: event.sender_id,
    });

    try {
      const user = await client.users.fetch(event.sender_id);
      if (user) {
        await sendDMWithRetry(
          user,
          "❌ Failed to list recent emails. Please try again later."
        );
      }
    } catch (sendError) {
      logWarn("Failed to send error message for listMail command", {
        error: sendError,
      });
    }
  }
};


