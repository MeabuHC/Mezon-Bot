import express from 'express';
import { gmailAuthService } from '../services/gmailAuthService.js';
import { emailRepository } from '../repositories/emailRepository.js';
import { logInfo, logError } from '../logger.js';
import { env } from '../config/env.js';
import { MezonClient } from 'mezon-sdk';
import { google } from 'googleapis';

export class OAuthCallbackServer {
    private app: express.Application;
    private server: any;
    private client: MezonClient;

    constructor(client: MezonClient) {
        this.app = express();
        this.client = client;
        this.setupRoutes();
    }

    private setupRoutes() {
        // Health check
        this.app.get('/', (req, res) => {
            res.send('Mezon Email Bot OAuth Server is running');
        });

        // OAuth callback route
        this.app.get('/oauth/callback', async (req, res) => {
            const { code, state, error } = req.query;

            // Handle OAuth error
            if (error) {
                logError('OAuth error', { error });
                res.send(`
          <html>
            <head>
              <title>Lỗi đăng nhập</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .error { color: #d32f2f; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Đăng nhập thất bại</h1>
              <p>Đã xảy ra lỗi trong quá trình xác thực: ${error}</p>
              <p>Vui lòng thử lại bằng cách sử dụng lệnh *login trong Mezon.</p>
            </body>
          </html>
        `);
                return;
            }

            if (!code || !state) {
                res.status(400).send('Missing code or state parameter');
                return;
            }

            const mezonUserId = state as string;

            try {
                // Exchange code for tokens
                const tokens = await gmailAuthService.getTokenFromCode(code as string);

                if (!tokens.access_token || !tokens.refresh_token) {
                    throw new Error('Failed to get tokens from OAuth');
                }

                // Get user's email address
                const oauth2Client = gmailAuthService.createAuthenticatedClient(
                    tokens.access_token,
                    tokens.refresh_token
                );

                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                const profile = await gmail.users.getProfile({ userId: 'me' });
                const email = profile.data.emailAddress || 'Unknown';

                // Save to database
                await emailRepository.saveUserEmail({
                    mezonUserId,
                    email,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : undefined
                });

                logInfo('User email connected successfully', { mezonUserId, email });

                // Send success notification via DM
                try {
                    const user = await this.client.users.fetch(mezonUserId);
                    if (user) {
                        await user.sendDM({
                            t: `✅ **Đăng nhập Gmail thành công!**\n\n📧 Email đã kết nối: **${email}**\n\nBây giờ bạn có thể sử dụng các tính năng email của bot.`
                        });
                    }
                } catch (dmError) {
                    logError('Failed to send success DM', dmError);
                }

                // Show success page
                res.send(`
          <html>
            <head>
              <title>Đăng nhập thành công</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .success { color: #388e3c; }
                .email { background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <h1 class="success">✅ Đăng nhập Gmail thành công!</h1>
              <div class="email">📧 Email: <strong>${email}</strong></div>
              <p>Tài khoản Gmail của bạn đã được kết nối với Mezon Bot.</p>
              <p>Bạn có thể đóng trang này và quay lại Mezon.</p>
              <hr>
              <p><small>Bạn có thể sử dụng các lệnh email trong Mezon để quản lý email của mình.</small></p>
            </body>
          </html>
        `);

            } catch (error) {
                logError('Failed to process OAuth callback', error);

                // Send error notification via DM
                try {
                    const user = await this.client.users.fetch(mezonUserId);
                    if (user) {
                        await user.sendDM({
                            t: `❌ **Đăng nhập Gmail thất bại!**\n\nĐã xảy ra lỗi trong quá trình xử lý. Vui lòng thử lại bằng lệnh *login.`
                        });
                    }
                } catch (dmError) {
                    logError('Failed to send error DM', dmError);
                }

                res.status(500).send(`
          <html>
            <head>
              <title>Lỗi đăng nhập</title>
              <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
                .error { color: #d32f2f; }
              </style>
            </head>
            <body>
              <h1 class="error">❌ Đã xảy ra lỗi</h1>
              <p>Không thể hoàn tất quá trình đăng nhập. Vui lòng thử lại.</p>
              <p><small>Nếu lỗi vẫn tiếp tục, vui lòng liên hệ quản trị viên.</small></p>
            </body>
          </html>
        `);
            }
        });
    }

    start(): Promise<void> {
        return new Promise((resolve) => {
            const port = parseInt(env.callbackServerPort);
            this.server = this.app.listen(port, () => {
                logInfo(`OAuth callback server started on port ${port}`);
                resolve();
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logInfo('OAuth callback server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}
