import { logWarn, logInfo } from "../logger.js";
import { getValidAccessToken } from "./tokenRefreshService.js";

export interface GmailLabel {
  id: string;
  name: string;
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
}

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isUnread: boolean;
}

export interface GmailInboxPage {
  summaries: GmailMessageSummary[];
  page: number;
  pageSize: number;
  totalMessages: number;
  hasNextPage: boolean;
}

/**
 * Get Gmail label details with message counts for a specific label
 */
async function getGmailLabelDetails(botUserId: string, labelId: string, accessToken: string): Promise<GmailLabel | null> {
  try {
    const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logWarn("Failed to fetch Gmail label details", {
        botUserId,
        labelId,
        status: response.status,
        error: errorText,
      });
      return null;
    }

    const label: any = await response.json();

    logInfo("Gmail Label API full response", {
      botUserId,
      labelId,
      fullResponse: label,
      allKeys: Object.keys(label),
    });

    const labelData: GmailLabel = {
      id: label.id || "",
      name: label.name || "",
      messagesTotal: label.messagesTotal ?? 0,
      messagesUnread: label.messagesUnread ?? 0,
      threadsTotal: label.threadsTotal ?? 0,
      threadsUnread: label.threadsUnread ?? 0,
    };

    logInfo("Fetched label details", {
      botUserId,
      labelId,
      labelName: labelData.name,
      messagesTotal: labelData.messagesTotal,
      messagesUnread: labelData.messagesUnread,
      threadsTotal: labelData.threadsTotal,
      threadsUnread: labelData.threadsUnread,
      rawResponse: {
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
        threadsTotal: label.threadsTotal,
        threadsUnread: label.threadsUnread,
        hasMessagesTotal: "messagesTotal" in label,
        hasMessagesUnread: "messagesUnread" in label,
        hasThreadsTotal: "threadsTotal" in label,
        hasThreadsUnread: "threadsUnread" in label,
      },
    });

    return labelData;
  } catch (error) {
    logWarn("Error fetching Gmail label details", { error, botUserId, labelId });
    return null;
  }
}

/**
 * Get a page of messages from a specific label (headers only)
 * page is 1-based, pageSize controls how many messages per page
 * labelId defaults to "INBOX" but can be "SENT", "DRAFT", "SPAM", "TRASH", "STARRED", etc.
 * query is an optional Gmail search query (e.g., "from:example@gmail.com", "subject:keyword", "after:2024/1/1")
 */
export async function getInboxMessageSummaries(
  botUserId: string,
  pageSize = 10,
  page = 1,
  labelId: string = "INBOX",
  query?: string
): Promise<GmailInboxPage | null> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No valid access token available for fetching inbox messages", {
        botUserId,
      });
      return null;
    }

    let searchQuery = labelId === "INBOX" ? "in:inbox" : `label:${labelId}`;
    if (query && query.trim()) {
      searchQuery = `${searchQuery} ${query.trim()}`;
    }
    
    const totalMessages = await countMessagesByQuery(
      botUserId,
      searchQuery,
      accessToken
    );

    const totalPages = Math.ceil(totalMessages / pageSize);
    if (page > totalPages && totalMessages > 0) {
      return {
        summaries: [],
        page,
        pageSize,
        totalMessages,
        hasNextPage: false,
      };
    }

    const totalMessagesNeeded = page * pageSize;

    let pageToken: string | undefined;
    let allMessages: { id: string; threadId: string }[] = [];
    let hasNextPage = false;

    while (allMessages.length < totalMessagesNeeded) {
      const url = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages"
      );
      url.searchParams.set("q", searchQuery);
      url.searchParams.set("maxResults", String(pageSize));
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const listResponse = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        logWarn("Failed to list inbox messages", {
          botUserId,
          status: listResponse.status,
          error: errorText,
        });
        return null;
      }

      const listData = await listResponse.json();
      const messages: { id: string; threadId: string }[] =
        listData.messages || [];

      allMessages = allMessages.concat(messages);
      hasNextPage = Boolean(listData.nextPageToken);

      if (messages.length < pageSize || !listData.nextPageToken) {
        break;
      }

      if (allMessages.length >= totalMessagesNeeded) {
        break;
      }

      pageToken = listData.nextPageToken;
    }

    const targetStartIndex = (page - 1) * pageSize;
    const targetEndIndex = targetStartIndex + pageSize;
    const targetMessages = allMessages.slice(targetStartIndex, targetEndIndex);

    let actualTotalMessages = totalMessages;
    if (!hasNextPage) {
      actualTotalMessages = allMessages.length;
    }

    if (targetMessages.length === 0) {
      return {
        summaries: [],
        page,
        pageSize,
        totalMessages: actualTotalMessages,
        hasNextPage: false,
      };
    }

    const summaries: GmailMessageSummary[] = [];

    for (const msg of targetMessages) {
      try {
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        if (!msgResponse.ok) {
          const errorText = await msgResponse.text();
          logWarn("Failed to fetch message metadata", {
            botUserId,
            messageId: msg.id,
            status: msgResponse.status,
            error: errorText,
          });
          continue;
        }

        const data: any = await msgResponse.json();
        const headers: any[] = data.payload?.headers ?? [];

        const getHeader = (name: string): string => {
          const header = headers.find(
            (h: any) => h.name?.toLowerCase() === name.toLowerCase()
          );
          return header?.value ?? "";
        };

        const subject = getHeader("Subject") || "(no subject)";
        const from = getHeader("From") || "";
        const date = getHeader("Date") || "";
        const snippet = data.snippet ?? "";
        const isUnread =
          Array.isArray(data.labelIds) && data.labelIds.includes("UNREAD");

        summaries.push({
          id: data.id,
          threadId: data.threadId,
          subject,
          from,
          date,
          snippet,
          isUnread,
        });
      } catch (error) {
        logWarn("Error fetching message metadata", {
          error,
          botUserId,
          messageId: msg.id,
        });
      }
    }

    logInfo("Fetched inbox message page", {
      botUserId,
      page,
      pageSize,
      returned: summaries.length,
      totalMessages: actualTotalMessages,
      hasNextPage,
      allMessagesFetched: allMessages.length,
      estimateWas: totalMessages,
    });

    return {
      summaries,
      page,
      pageSize,
      totalMessages: actualTotalMessages,
      hasNextPage,
    };
  } catch (error) {
    logWarn("Error fetching inbox message summaries", { error, botUserId });
    return null;
  }
}

/**
 * Get Gmail labels with message counts for a user
 */
export async function getGmailLabels(botUserId: string): Promise<GmailLabel[] | null> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No valid access token available for fetching Gmail labels", { botUserId });
      return null;
    }

    const listResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      logWarn("Failed to fetch Gmail labels list", {
        botUserId,
        status: listResponse.status,
        statusText: listResponse.statusText,
        error: errorText,
      });
      return null;
    }

    const listData = await listResponse.json();
    const allLabels = listData.labels || [];

    logInfo("Fetched Gmail labels list", {
      botUserId,
      labelCount: allLabels.length,
      allLabelNames: allLabels.map((l: any) => ({ id: l.id, name: l.name, type: l.type })),
    });

    const importantLabelIds = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "STARRED"];
    const labels: GmailLabel[] = [];

    for (const label of allLabels) {
      const labelId = label.id;
      const labelName = (label.name || "").toUpperCase();

      if (importantLabelIds.includes(labelName) && labelId === labelName) {
        const labelDetails = await getGmailLabelDetails(botUserId, labelId, accessToken);
        if (labelDetails) {
          labels.push(labelDetails);
        }
      }
    }

    const categoryPersonal = allLabels.find(
      (l: any) => l.id === "CATEGORY_PERSONAL" && l.name === "CATEGORY_PERSONAL"
    );
    if (categoryPersonal) {
      const categoryDetails = await getGmailLabelDetails(botUserId, "CATEGORY_PERSONAL", accessToken);
      if (categoryDetails) {
        labels.push(categoryDetails);
        logInfo("Got CATEGORY_PERSONAL (Primary tab)", {
          botUserId,
          total: categoryDetails.messagesTotal,
          unread: categoryDetails.messagesUnread,
        });
      }
    }

    return labels;
  } catch (error) {
    logWarn("Error fetching Gmail labels", { error, botUserId });
    return null;
  }
}

/**
 * Count messages using Gmail search query (more accurate than label counts)
 * Uses resultSizeEstimate for performance, which is accurate for Gmail API
 */
async function countMessagesByQuery(botUserId: string, query: string, accessToken: string): Promise<number> {
  try {
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logWarn("Failed to count messages by query", {
        botUserId,
        query,
        status: response.status,
        error: errorText,
      });
      return 0;
    }

    const data = await response.json();
    const count = data.resultSizeEstimate ?? 0;

    logInfo("Counted messages by query", {
      botUserId,
      query,
      count,
      method: "resultSizeEstimate",
    });

    return count;
  } catch (error) {
    logWarn("Error counting messages by query", { error, botUserId, query });
    return 0;
  }
}

/**
 * Get important Gmail label counts (Inbox, Sent, Drafts, etc.)
 * Uses search queries for INBOX to match Gmail UI main view count
 * Uses label API for categories and other labels for accurate counts
 * Returns messages and threads counts (total and unread)
 */
export async function getImportantGmailLabelCounts(botUserId: string): Promise<Record<string, { total: number; unread: number; threadsTotal?: number; threadsUnread?: number }> | null> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No valid access token available for fetching Gmail label counts", { botUserId });
      return null;
    }

    const listResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      logWarn("Failed to fetch Gmail labels list for counts", {
        botUserId,
        status: listResponse.status,
        error: errorText,
      });
      return null;
    }

    const listData = await listResponse.json();
    const allLabels = listData.labels || [];

    const counts: Record<string, { total: number; unread: number; threadsTotal?: number; threadsUnread?: number }> = {};

    const inboxUnread = await countMessagesByQuery(botUserId, "in:inbox is:unread", accessToken);
    const inboxTotal = await countMessagesByQuery(botUserId, "in:inbox", accessToken);

    const inboxLabelDetails = await getGmailLabelDetails(botUserId, "INBOX", accessToken);
    counts["INBOX"] = {
      total: inboxTotal,
      unread: inboxUnread,
      threadsTotal: inboxLabelDetails?.threadsTotal,
      threadsUnread: inboxLabelDetails?.threadsUnread,
    };

    const categoryLabelIds = [
      "CATEGORY_PERSONAL",
      "CATEGORY_SOCIAL",
      "CATEGORY_PROMOTIONS",
      "CATEGORY_UPDATES",
      "CATEGORY_FORUMS",
    ];

    for (const label of allLabels) {
      const labelId = label.id;
      if (categoryLabelIds.includes(labelId)) {
        const labelDetails = await getGmailLabelDetails(botUserId, labelId, accessToken);
        if (labelDetails) {
          counts[labelId] = {
            total: labelDetails.messagesTotal,
            unread: labelDetails.messagesUnread,
            threadsTotal: labelDetails.threadsTotal,
            threadsUnread: labelDetails.threadsUnread,
          };
        }
      }
    }

    const systemLabelIds = ["SENT", "DRAFT", "SPAM", "TRASH", "STARRED"];
    for (const label of allLabels) {
      const labelId = label.id;
      if (systemLabelIds.includes(labelId)) {
        const labelDetails = await getGmailLabelDetails(botUserId, labelId, accessToken);
        if (labelDetails) {
          counts[labelId] = {
            total: labelDetails.messagesTotal,
            unread: labelDetails.messagesUnread,
            threadsTotal: labelDetails.threadsTotal,
            threadsUnread: labelDetails.threadsUnread,
          };
        }
      }
    }

    logInfo("Fetched Gmail label counts", {
      botUserId,
      counts,
      labelCount: Object.keys(counts).length,
      method: "mixed (search for INBOX, label API for others)",
    });

    return counts;
  } catch (error) {
    logWarn("Error fetching Gmail label counts", { error, botUserId });
    return null;
  }
}

