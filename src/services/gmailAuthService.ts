import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { logInfo, logError } from '../logger.js';

const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify'
];

export class GmailAuthService {
    private oauth2Client: OAuth2Client;

    constructor() {
        if (!env.gmailClientId || !env.gmailClientSecret) {
            throw new Error('Gmail OAuth credentials are not configured. Please set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env file');
        }

        this.oauth2Client = new google.auth.OAuth2(
            env.gmailClientId,
            env.gmailClientSecret,
            env.gmailRedirectUri
        );
    }

    /**
     * Generate authentication URL for user to authorize the bot
     * @param mezonUserId - The Mezon user ID to track the login session
     * @returns Authentication URL
     */
    generateAuthUrl(mezonUserId: string): string {
        const authUrl = this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            state: mezonUserId, // Pass user ID in state parameter for tracking
            prompt: 'consent' // Force consent screen to get refresh token
        });

        logInfo('Generated auth URL', { mezonUserId });
        return authUrl;
    }

    /**
     * Exchange authorization code for access token
     * @param code - Authorization code from OAuth callback
     * @returns Token information
     */
    async getTokenFromCode(code: string) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            logInfo('Successfully exchanged code for tokens');
            return tokens;
        } catch (error) {
            logError('Failed to get token from code', error);
            throw error;
        }
    }

    /**
     * Create OAuth2 client with stored tokens
     * @param accessToken - Access token
     * @param refreshToken - Refresh token
     * @returns Configured OAuth2Client
     */
    createAuthenticatedClient(accessToken: string, refreshToken: string): OAuth2Client {
        const client = new google.auth.OAuth2(
            env.gmailClientId,
            env.gmailClientSecret,
            env.gmailRedirectUri
        );

        client.setCredentials({
            access_token: accessToken,
            refresh_token: refreshToken
        });

        return client;
    }

    /**
     * Verify if tokens are still valid
     * @param accessToken - Access token to verify
     * @returns true if valid, false otherwise
     */
    async verifyToken(accessToken: string): Promise<boolean> {
        try {
            const ticket = await this.oauth2Client.verifyIdToken({
                idToken: accessToken,
                audience: env.gmailClientId
            });
            return !!ticket;
        } catch (error) {
            return false;
        }
    }
}

// Singleton instance
export const gmailAuthService = new GmailAuthService();
