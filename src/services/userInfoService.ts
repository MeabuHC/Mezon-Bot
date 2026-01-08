import { logWarn, logInfo } from "../logger.js";

/**
 * Fetch user's email from Google using access token
 */
export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
    try {
        const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logWarn("Failed to fetch user info from Google", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
            });
            return null;
        }

        const data = await response.json();
        const email = data.email || null;

        if (email) {
            logInfo("Successfully fetched user email from Google", { email });
        } else {
            logWarn("No email found in Google userinfo response", { data });
        }

        return email;
    } catch (error) {
        logWarn("Error fetching user email from Google", { error });
        return null;
    }
}

