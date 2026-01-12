import { logInfo, logWarn, logError } from "../logger.js";
import { getValidAccessToken } from "./tokenRefreshService.js";

export type EmailActionResult = {
  success: boolean;
  message?: string;
  error?: string;
};

/**
 * Star or unstar an email
 */
export async function starEmail(
  botUserId: string,
  messageId: string,
  star: boolean = true
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    const addLabelIds = star ? ["STARRED"] : [];
    const removeLabelIds = star ? [] : ["STARRED"];

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          addLabelIds,
          removeLabelIds,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to ${star ? "star" : "unstar"} email. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to star/unstar email", {
        botUserId,
        messageId,
        star,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email starred/unstarred successfully", { botUserId, messageId, star });
    return {
      success: true,
      message: `Email ${star ? "starred" : "unstarred"} successfully.`,
    };
  } catch (error) {
    logError("Error starring/unstarring email", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while modifying the email.",
    };
  }
}

/**
 * Delete an email (moves to trash - recoverable)
 */
export async function deleteEmail(
  botUserId: string,
  messageId: string
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    // Use trash instead of delete (recoverable)
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to delete email. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to delete email", {
        botUserId,
        messageId,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email deleted (trashed) successfully", { botUserId, messageId });
    return {
      success: true,
      message: "Email moved to trash successfully.",
    };
  } catch (error) {
    logError("Error deleting email", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while deleting the email.",
    };
  }
}

/**
 * Permanently delete an email (cannot be recovered)
 */
export async function permanentlyDeleteEmail(
  botUserId: string,
  messageId: string
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to permanently delete email. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to permanently delete email", {
        botUserId,
        messageId,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email permanently deleted successfully", { botUserId, messageId });
    return {
      success: true,
      message: "Email permanently deleted successfully.",
    };
  } catch (error) {
    logError("Error permanently deleting email", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while deleting the email.",
    };
  }
}

/**
 * Archive an email (removes from inbox but keeps in All Mail)
 */
export async function archiveEmail(
  botUserId: string,
  messageId: string
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    // Archive = remove INBOX label
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          removeLabelIds: ["INBOX"],
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to archive email. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to archive email", {
        botUserId,
        messageId,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email archived successfully", { botUserId, messageId });
    return {
      success: true,
      message: "Email archived successfully.",
    };
  } catch (error) {
    logError("Error archiving email", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while archiving the email.",
    };
  }
}

/**
 * Mark email as read or unread
 */
export async function markEmailRead(
  botUserId: string,
  messageId: string,
  read: boolean = true
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    const addLabelIds = read ? [] : ["UNREAD"];
    const removeLabelIds = read ? ["UNREAD"] : [];

    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          addLabelIds,
          removeLabelIds,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to mark email as ${read ? "read" : "unread"}. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to mark email as read/unread", {
        botUserId,
        messageId,
        read,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email marked as read/unread successfully", { botUserId, messageId, read });
    return {
      success: true,
      message: `Email marked as ${read ? "read" : "unread"} successfully.`,
    };
  } catch (error) {
    logError("Error marking email as read/unread", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while modifying the email.",
    };
  }
}

/**
 * Restore email from trash
 */
export async function restoreEmail(
  botUserId: string,
  messageId: string
): Promise<EmailActionResult> {
  try {
    const accessToken = await getValidAccessToken(botUserId);
    if (!accessToken) {
      return {
        success: false,
        message: "Authentication required. Please login with *login command.",
      };
    }

    // Untrash = remove TRASH label
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/untrash`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Failed to restore email. Status: ${response.status}`;
      
      if (response.status === 403) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.reason === "insufficientPermissions" || 
              errorData.error?.code === 403) {
            errorMessage = "Insufficient permissions. Please re-login with `*login` to grant modify permissions.";
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }
      
      logWarn("Failed to restore email from trash", {
        botUserId,
        messageId,
        status: response.status,
        error: errorText,
      });
      return {
        success: false,
        error: errorMessage,
      };
    }

    logInfo("Email restored from trash successfully", { botUserId, messageId });
    return {
      success: true,
      message: "Email restored from trash successfully.",
    };
  } catch (error) {
    logError("Error restoring email from trash", { error, botUserId, messageId });
    return {
      success: false,
      error: "An error occurred while restoring the email.",
    };
  }
}

