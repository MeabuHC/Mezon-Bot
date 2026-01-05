import { logInfo, logWarn } from "../logger.js";
import { emailRepository } from "../repositories/emailRepository.js";
import { CommandHandler } from "../types/mezon.js";

export const runLogout: CommandHandler = async (client, event) => {
    const mezonUserId = event.sender_id;

    try {
        // Check if user has connected email
        const existingEmail = await emailRepository.getUserEmail(mezonUserId);

        if (!existingEmail) {
            const channel = await client.channels.fetch(event.channel_id);
            await channel.send({
                t: `ℹ️ Bạn chưa kết nối tài khoản Gmail nào. Sử dụng lệnh *login để kết nối.`
            });
            return;
        }

        // Delete user email credentials
        await emailRepository.deleteUserEmail(mezonUserId);

        // Send confirmation
        const channel = await client.channels.fetch(event.channel_id);
        await channel.send({
            t: `✅ Đã ngắt kết nối tài khoản Gmail: **${existingEmail.email}**\n\nBạn có thể kết nối lại bất cứ lúc nào bằng lệnh *login`
        });

        logInfo('User logged out', { mezonUserId, email: existingEmail.email });
    } catch (error) {
        logWarn('Logout command failed', { mezonUserId, error });

        try {
            const channel = await client.channels.fetch(event.channel_id);
            await channel.send({
                t: `❌ Đã xảy ra lỗi khi ngắt kết nối. Vui lòng thử lại sau.`
            });
        } catch (replyError) {
            logWarn('Failed to send error message', { replyError });
        }
    }
};
