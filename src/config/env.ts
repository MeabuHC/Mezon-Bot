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
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const oauthRedirectUri = process.env.OAUTH_REDIRECT_URI;
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

export const env = {
    botId,
    token,
    databaseUrl,
    googleClientId,
    googleClientSecret,
    oauthRedirectUri,
    port,
};

