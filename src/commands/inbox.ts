import type { CommandHandler } from "../types/mezon.js";
import { logInfo, logWarn } from "../logger.js";
import { InteractiveBuilder, EButtonMessageStyle, EMessageComponentType } from "mezon-sdk";
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

/**
 * Core inbox logic that can be called via command handler
 */
export async function showInboxPage(
  client: any,
  botUserId: string,
  channelId: string,
  page: number,
  labelId: string = "INBOX",
  query?: string
): Promise<void> {
  try {
    const user = await client.users.fetch(botUserId);
    if (!user) {
      logWarn("Could not resolve user for inbox", { sender: botUserId });
      return;
    }

    // 25 per page to avoid exceeding 8000 character message limit
    const pageSize = 25;

  // Ensure the user has a connected Gmail account
  const dbUser = await prisma.user.findUnique({
    where: { botUserId: String(botUserId) },
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
      sender_id: botUserId,
      sender_id_type: typeof botUserId,
      dbUser_found: !!dbUser,
      has_oauthToken: !!dbUser?.oauthToken,
    });
    return;
  }

  // Fetch inbox page (headers only)
  const inboxPage = await getInboxMessageSummaries(
    botUserId,
    pageSize,
    page,
    labelId,
    query
  );

  // Get label display name
  const labelNames: Record<string, { emoji: string; name: string }> = {
    INBOX: { emoji: "📥", name: "Inbox" },
    SENT: { emoji: "📤", name: "Sent" },
    DRAFT: { emoji: "📝", name: "Drafts" },
    SPAM: { emoji: "🚫", name: "Spam" },
    TRASH: { emoji: "🗑️", name: "Trash" },
    STARRED: { emoji: "⭐", name: "Starred" },
  };
  const labelInfo = labelNames[labelId] || { emoji: "📧", name: labelId };

  let description = `Latest emails from your Gmail ${labelInfo.name.toLowerCase()}.`;
  if (query && query.trim()) {
    description += `\n\n**Filter:** \`${query.trim()}\``;
  }
  
  const embedBuilder = new InteractiveBuilder(`${labelInfo.emoji} ${labelInfo.name}`)
    .setDescription(description);

  let components: any[] = [];
  let currentPage = page;
  let totalPages = 1;

  if (!inboxPage) {
    embedBuilder.addField(
      "Error",
      "Failed to fetch inbox messages. Please try again later.",
      false
    );
  } else if (inboxPage.summaries.length === 0) {
    // Check if page is out of range
    totalPages = Math.ceil(inboxPage.totalMessages / pageSize);
    if (page > totalPages && inboxPage.totalMessages > 0) {
      embedBuilder.addField(
        "❌ Invalid Page",
        `Page ${page} does not exist. Maximum page is ${totalPages}.`,
        false
      );
      embedBuilder.addField(
        "Total Messages",
        `${inboxPage.totalMessages.toLocaleString()} emails`,
        false
      );
    } else {
      embedBuilder.addField(
        "No emails found",
        "Your inbox appears to be empty.",
        false
      );
    }
  } else {
    const { summaries, totalMessages, page: inboxCurrentPage, pageSize: inboxPageSize } =
      inboxPage;

    currentPage = inboxCurrentPage;
    totalPages = Math.ceil(totalMessages / inboxPageSize);

    const startIndex = (currentPage - 1) * inboxPageSize + 1;
    const endIndex = startIndex + summaries.length - 1;

    embedBuilder.addField(
      "Range",
      `${startIndex}–${endIndex} of ${totalMessages.toLocaleString()} (Page ${currentPage} of ${totalPages})`,
      false
    );

    summaries.forEach((msg, index) => {
      const indexLabel = startIndex + index;
      const sender = extractSenderName(msg.from);
      const shortDate = formatShortDate(msg.date);

      // Keep the subject reasonably short
      const subject =
        msg.subject.length > 60
          ? msg.subject.slice(0, 57) + "..."
          : msg.subject;

      const title = `${indexLabel}. ${sender}`;
      const valueParts = [subject];
      if (shortDate) {
        valueParts.push(shortDate);
      }

      embedBuilder.addField(title, valueParts.join(" • "), false);
    });

    // Add pagination buttons
    const buttonRow: any[] = [];

    // Encode query in button ID (base64 encode to handle special characters)
    const queryEncoded = query ? Buffer.from(query).toString("base64url") : "";
    const queryPart = queryEncoded ? `_${queryEncoded}` : "";

    // Only show Previous button if not on first page
    if (currentPage > 1) {
      buttonRow.push({
        id: `inbox_PREV_${botUserId}_${labelId}${queryPart}_${currentPage}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "◀ Previous",
          style: EButtonMessageStyle.SECONDARY,
        },
      });
    }

    // Only show Next button if not on last page
    if (currentPage < totalPages) {
      buttonRow.push({
        id: `inbox_NEXT_${botUserId}_${labelId}${queryPart}_${currentPage}`,
        type: EMessageComponentType.BUTTON,
        component: {
          label: "Next ▶",
          style: EButtonMessageStyle.SECONDARY,
        },
      });
    }

    // Only add components if there are buttons to show
    if (buttonRow.length > 0) {
      components.push({ components: buttonRow });
    }
  }

  const embed = embedBuilder.build();

  await user.sendDM({ 
    embed: [embed],
    components: components.length > 0 ? components : undefined,
  });

    logInfo("Inbox page displayed", {
      channel_id: channelId,
      sender_id: botUserId,
    page: currentPage,
    });

  } catch (error) {
    logWarn("Failed to display inbox page", {
      error,
      channel_id: channelId,
      sender_id: botUserId,
      page,
    });

    try {
      const user = await client.users.fetch(botUserId);
      if (user) {
        await sendDMWithRetry(
          user,
          "❌ Failed to list recent emails. Please try again later."
        );
      }
    } catch (sendError) {
      logWarn("Failed to send error message for inbox page", {
        error: sendError,
      });
    }
    throw error; // Re-throw so calling code can handle it if needed
  }
}

export const runInbox: CommandHandler = async (client, event) => {
  try {
    const text = event.content?.t || "";
    const parts = text.trim().split(/\s+/);
    
    // Parse label, query, and page parameters
    // Format: *inbox [label] [query] [page] or *inbox [label] [page] or *inbox [query] [page]
    let labelId = "INBOX";
    let query: string | undefined;
    let page = 1;
    
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
    
    let i = 1;
    
    // Check if first argument is a label
    if (parts[i] && labelMap[parts[i].toLowerCase()]) {
      labelId = labelMap[parts[i].toLowerCase()];
      i++;
    }
    
    // Check if next argument is a query (starts with filter keywords) or page number
    if (parts[i]) {
      // Check if it's a filter query (contains "from:", "subject:", "after:", etc.)
      const filterKeywords = ["from:", "subject:", "after:", "before:", "has:", "is:", "in:", "label:"];
      const isQuery = filterKeywords.some(keyword => parts[i].toLowerCase().startsWith(keyword));
      
      if (isQuery) {
        // Collect all parts that form the query (until we hit a number that looks like a page)
        const queryParts: string[] = [];
        while (i < parts.length) {
          const part = parts[i];
          // If it's a number and looks like a page number, stop
          if (/^\d+$/.test(part) && parseInt(part, 10) > 0 && parseInt(part, 10) < 1000) {
            page = parseInt(part, 10);
            break;
          }
          queryParts.push(part);
          i++;
        }
        query = queryParts.join(" ");
      } else {
        // It's a page number
        const parsedPage = parseInt(parts[i], 10);
        if (Number.isFinite(parsedPage) && parsedPage > 0) {
          page = parsedPage;
    }
      }
    }

    // Send loading message immediately (same as button click handler)
    const user = await client.users.fetch(event.sender_id);
    if (user) {
      await user.sendDM({
        t: "⏳ Loading inbox...",
      });
    }

    await showInboxPage(client, event.sender_id, event.channel_id, page, labelId, query);
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

