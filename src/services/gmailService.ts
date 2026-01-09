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
    
    // Log the full API response to see all available fields
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
 * Get Gmail labels with message counts for a user
 */
export async function getGmailLabels(botUserId: string): Promise<GmailLabel[] | null> {
  try {
    // Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      logWarn("No valid access token available for fetching Gmail labels", { botUserId });
      return null;
    }

    // First, get list of all labels
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

    // For important labels, get detailed info with counts
    // System labels have specific IDs that match their names
    const importantLabelIds = ["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "STARRED"];
    const labels: GmailLabel[] = [];

    // Get detailed info for important system labels
    for (const label of allLabels) {
      const labelId = label.id;
      const labelName = (label.name || "").toUpperCase();
      
      // System labels have ID matching name
      if (importantLabelIds.includes(labelName) && labelId === labelName) {
        const labelDetails = await getGmailLabelDetails(botUserId, labelId, accessToken);
        if (labelDetails) {
          labels.push(labelDetails);
        }
      }
    }
    
    // Also get CATEGORY_PERSONAL (Primary tab) - this matches what Gmail UI shows
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
    // Use resultSizeEstimate which Gmail API provides - it's accurate for counting
    // This is much faster than paginating through all messages
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
    // resultSizeEstimate is accurate for Gmail API search queries
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

    // Get list of all labels first
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

    // For INBOX, use search query to match what Gmail UI shows in main view
    // This is more accurate than label API which may count differently
    // Also get thread counts from label API for INBOX
    const inboxUnread = await countMessagesByQuery(botUserId, "in:inbox is:unread", accessToken);
    const inboxTotal = await countMessagesByQuery(botUserId, "in:inbox", accessToken);
    
    // Get thread counts from label API for INBOX
    const inboxLabelDetails = await getGmailLabelDetails(botUserId, "INBOX", accessToken);
    counts["INBOX"] = { 
      total: inboxTotal, 
      unread: inboxUnread,
      threadsTotal: inboxLabelDetails?.threadsTotal,
      threadsUnread: inboxLabelDetails?.threadsUnread,
    };

    // For categories, use label API for accurate counts
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

    // For other system labels (SENT, DRAFT, SPAM, TRASH, STARRED), use label API
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

