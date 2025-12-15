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

export const env = {
    botId,
    token,
    databaseUrl,
};

