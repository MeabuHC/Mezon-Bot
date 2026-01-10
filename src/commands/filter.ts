import type { MezonClient } from "mezon-sdk";
import { PrismaClient } from "@prisma/client";
import { logInfo, logWarn } from "../logger.js";
import { sendDMWithRetry } from "../utils/sendDM.js";

const prisma = new PrismaClient();

function parseArgs(text: string) {
    const parts = text.trim().split(/\s+/);
    // parts[0] is *filter
    return parts.slice(1);
}

export async function handleFilter(botUserId: string, channelId: string, client: MezonClient, text: string): Promise<void> {
    try {
        const user = await prisma.user.findUnique({ where: { botUserId }, include: { subscriptions: true } });
        const targetUser = await client.users.fetch(botUserId);
        if (!targetUser) return;

        if (!user) {
            await sendDMWithRetry(targetUser, "ℹ️ You need to login first. Use `*login` to connect your Gmail account.");
            return;
        }

        const args = parseArgs(text || "");
        if (args.length === 0) {
            await sendDMWithRetry(targetUser, "Usage: *filter add|list|remove ...\nExamples:\n*filter add include ^noreply@\n*filter add exclude @spamdomain\\.com$");
            return;
        }

        const sub = await prisma.subscription.findFirst({ where: { userId: user.id, alertType: "new_email" } });
        if (!sub) {
            // create an inactive subscription to hold filters
            await prisma.subscription.create({ data: { userId: user.id, alertType: "new_email", includePatterns: [], excludePatterns: [], isActive: false } as any });
        }

        const cmd = args[0].toLowerCase();
        if (cmd === "add") {
            const which = (args[1] || "").toLowerCase();
            const pattern = args.slice(2).join(" ");
            if (!which || !pattern || (which !== "include" && which !== "exclude")) {
                await sendDMWithRetry(targetUser, "Usage: *filter add include|exclude <regex>");
                return;
            }

            if (which === "include") {
                await prisma.subscription.updateMany({ where: { userId: user.id, alertType: "new_email" }, data: { includePatterns: { push: pattern } } as any });
            } else {
                await prisma.subscription.updateMany({ where: { userId: user.id, alertType: "new_email" }, data: { excludePatterns: { push: pattern } } as any });
            }

            await sendDMWithRetry(targetUser, `✅ Pattern added to ${which} filters: ${pattern}`);
            logInfo("Filter added", { botUserId, which, pattern });
            return;
        }

        if (cmd === "list") {
            const subs = await prisma.subscription.findMany({ where: { userId: user.id, alertType: "new_email" } });
            if (subs.length === 0) {
                await sendDMWithRetry(targetUser, "No subscription or filters found.");
                return;
            }
            const lines: string[] = [];
            for (const s of subs) {
                const ss: any = s;
                lines.push(`Subscription ${s.id} (active: ${s.isActive})`);
                lines.push(`Include patterns:`);
                (ss.includePatterns || []).forEach((p: string, i: number) => lines.push(`  [${i}] ${p}`));
                lines.push(`Exclude patterns:`);
                (ss.excludePatterns || []).forEach((p: string, i: number) => lines.push(`  [${i}] ${p}`));
            }
            await sendDMWithRetry(targetUser, lines.join("\n") || "No filters set.");
            return;
        }

        if (cmd === "remove") {
            const which = (args[1] || "").toLowerCase();
            const idx = parseInt(args[2] || "", 10);
            if (!which || isNaN(idx) || (which !== "include" && which !== "exclude")) {
                await sendDMWithRetry(targetUser, "Usage: *filter remove include|exclude <index> (use *filter list to see indexes)");
                return;
            }

            const s = await prisma.subscription.findFirst({ where: { userId: user.id, alertType: "new_email" } });
            if (!s) {
                await sendDMWithRetry(targetUser, "No subscription found.");
                return;
            }

            if (which === "include") {
                const arr = (s as any).includePatterns || [];
                if (idx < 0 || idx >= arr.length) {
                    await sendDMWithRetry(targetUser, "Invalid index");
                    return;
                }
                arr.splice(idx, 1);
                await prisma.subscription.update({ where: { id: s.id }, data: { includePatterns: { set: arr } } as any });
                await sendDMWithRetry(targetUser, `✅ Removed include pattern at index ${idx}`);
            } else {
                const arr = (s as any).excludePatterns || [];
                if (idx < 0 || idx >= arr.length) {
                    await sendDMWithRetry(targetUser, "Invalid index");
                    return;
                }
                arr.splice(idx, 1);
                await prisma.subscription.update({ where: { id: s.id }, data: { excludePatterns: { set: arr } } as any });
                await sendDMWithRetry(targetUser, `✅ Removed exclude pattern at index ${idx}`);
            }
            return;
        }

        await sendDMWithRetry(targetUser, "Unknown subcommand. Use add|list|remove.");
    } catch (error) {
        logWarn("Filter command failed", { error, botUserId });
        try {
            const targetUser = await client.users.fetch(botUserId);
            if (targetUser) await sendDMWithRetry(targetUser, "❌ Filter command failed. Please try again later.");
        } catch (_) { }
    }
}

export default handleFilter;
