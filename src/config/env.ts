import dotenv from "dotenv";

dotenv.config();

const required = ["BOT_ID", "APPLICATION_TOKEN"] as const;

for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing required env var: ${key}`);
    }
}

const botId = process.env.BOT_ID!;
const token = process.env.APPLICATION_TOKEN!;
const databaseUrl = process.env.DATABASE_URL;
const gmailClientId = process.env.GMAIL_CLIENT_ID;
const gmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
const gmailRedirectUri = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/oauth/callback";
const callbackServerPort = process.env.CALLBACK_SERVER_PORT || "3000";

export const env = {
    botId,
    token,
    databaseUrl,
    gmailClientId,
    gmailClientSecret,
    gmailRedirectUri,
    callbackServerPort,
};

