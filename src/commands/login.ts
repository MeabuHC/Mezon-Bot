import { logInfo, logWarn } from "../logger.js";
import { gmailAuthService } from "../services/gmailAuthService.js";
import { emailRepository } from "../repositories/emailRepository.js";
import { CommandHandler } from "../types/mezon.js";

export const runLogin: CommandHandler = async (client, event) => {
    const mezonUserId = event.sender_id;

    try {
        // Check if user already has connected email
        const existingEmail = await emailRepository.getUserEmail(mezonUserId);

        if (existingEmail) {
            const channel = await client.channels.fetch(event.channel_id);
            await channel.send({
                t: `📧 Bạn đã kết nối email: **${existingEmail.email}**\n\nNếu muốn kết nối lại, vui lòng dùng lệnh *logout trước.`
            });
            return;
        }

        // Generate OAuth URL
        const authUrl = gmailAuthService.generateAuthUrl(mezonUserId);

        // Send auth URL to user via DM
        const user = await client.users.fetch(mezonUserId);
        if (user) {
            await user.sendDM({
                t: `🔐 **Đăng nhập Gmail cho Bot Email**\n\nĐể kết nối tài khoản Gmail của bạn, vui lòng:\n\n1. Click vào link bên dưới\n2. Chọn tài khoản Gmail bạn muốn kết nối\n3. Cho phép bot truy cập Gmail của bạn\n4. Sau khi hoàn tất, bạn sẽ nhận được thông báo xác nhận\n\n**Link đăng nhập:**\n${authUrl}\n\n⚠️ Link này chỉ dành riêng cho bạn và sẽ hết hạn sau 10 phút.`
            });
        }

        // Confirm in channel
        const channel = await client.channels.fetch(event.channel_id);
        await channel.send({
            t: `✅ Đã gửi link đăng nhập vào tin nhắn riêng của bạn. Vui lòng kiểm tra DM!`
        });

        logInfo('Login command executed', { mezonUserId });
    } catch (error) {
        logWarn('Login command failed', { mezonUserId, error });

        try {
            const channel = await client.channels.fetch(event.channel_id);
            await channel.send({
                t: `❌ Đã xảy ra lỗi khi tạo link đăng nhập. Vui lòng thử lại sau.`
            });
        } catch (replyError) {
            logWarn('Failed to send error message', { replyError });
        }
    }
};
