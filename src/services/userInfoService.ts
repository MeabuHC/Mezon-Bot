import { logWarn, logInfo } from "../logger.js";

export interface GoogleUserInfo {
    email: string | null;
    name: string | null;
    picture: string | null;
    verified_email: boolean | null;
}

/**
 * Fetch user's information from Google using access token
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
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
            return {
                email: null,
                name: null,
                picture: null,
                verified_email: null,
            };
        }

        const data = await response.json();
        const userInfo: GoogleUserInfo = {
            email: data.email || null,
            name: data.name || null,
            picture: data.picture || null,
            verified_email: data.verified_email ?? null,
        };

        if (userInfo.email) {
            logInfo("Successfully fetched user info from Google", {
                email: userInfo.email,
                name: userInfo.name,
                verified: userInfo.verified_email,
            });
        } else {
            logWarn("No email found in Google userinfo response", { data });
        }

        return userInfo;
    } catch (error) {
        logWarn("Error fetching user info from Google", { error });
        return {
            email: null,
            name: null,
            picture: null,
            verified_email: null,
        };
    }
}

/**
 * Fetch user's email from Google using access token (backward compatibility)
 */
export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
    const userInfo = await fetchGoogleUserInfo(accessToken);
    return userInfo.email;
}

