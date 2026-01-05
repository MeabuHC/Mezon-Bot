# Mezon Email Bot - Hướng dẫn Login Gmail

## Tổng quan

Bot Email cho phép người dùng Mezon kết nối tài khoản Gmail của họ để nhận thông báo, đọc và gửi email trực tiếp từ Mezon.

## Cấu hình Gmail OAuth

### Bước 1: Tạo Google Cloud Project

1. Truy cập [Google Cloud Console](https://console.cloud.google.com/)
2. Tạo project mới hoặc chọn project hiện có
3. Vào **APIs & Services** > **Library**
4. Tìm và enable **Gmail API**

### Bước 2: Tạo OAuth 2.0 Credentials

1. Vào **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Chọn **Application type**: Web application
4. Đặt tên cho OAuth client (ví dụ: "Mezon Email Bot")
5. Trong **Authorized redirect URIs**, thêm:
   - `http://localhost:3000/oauth/callback` (cho development)
   - Hoặc URL của server production của bạn
6. Click **Create**
7. Copy **Client ID** và **Client Secret**

### Bước 3: Cấu hình môi trường

1. Copy file `.env.example` thành `.env`:

   ```bash
   cp .env.example .env
   ```

2. Cập nhật các giá trị trong `.env`:
   ```env
   GMAIL_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your_client_secret_here
   GMAIL_REDIRECT_URI=http://localhost:3000/oauth/callback
   CALLBACK_SERVER_PORT=3000
   ```

### Bước 4: Chạy Migration Database

Chạy migration để tạo bảng `UserEmail` trong database:

```bash
npm run prisma:migrate
```

Hoặc dùng db push cho development:

```bash
npm run prisma:db-push
```

## Sử dụng

### Khởi động Bot

```bash
npm run dev
```

Bot sẽ khởi động cùng với OAuth callback server trên port 3000 (mặc định).

### Các lệnh có sẵn

#### 1. **`*login`** - Đăng nhập Gmail

Khi user gõ lệnh `*login` trong channel:

1. Bot sẽ gửi link OAuth vào DM của user
2. User click vào link và chọn tài khoản Gmail
3. User cho phép bot truy cập Gmail
4. User được redirect về trang xác nhận
5. Bot lưu access token và refresh token vào database
6. Bot gửi thông báo thành công vào DM

**Ví dụ:**

```
User: *login
Bot: ✅ Đã gửi link đăng nhập vào tin nhắn riêng của bạn. Vui lòng kiểm tra DM!
```

#### 2. **`*logout`** - Ngắt kết nối Gmail

Ngắt kết nối tài khoản Gmail đã liên kết:

```
User: *logout
Bot: ✅ Đã ngắt kết nối tài khoản Gmail: example@gmail.com
```

## Kiến trúc

### Luồng đăng nhập OAuth

```
User → *login command
  ↓
Bot generates OAuth URL with state (mezonUserId)
  ↓
Bot sends URL via DM
  ↓
User clicks URL → Google OAuth consent screen
  ↓
User authorizes → Google redirects to callback URL
  ↓
Callback server receives code + state
  ↓
Exchange code for tokens
  ↓
Get user email from Gmail API
  ↓
Save to database (UserEmail table)
  ↓
Send success message via DM
```

### Database Schema

```prisma
model UserEmail {
  id            String   @id @default(cuid())
  mezonUserId   String   @unique
  email         String
  accessToken   String
  refreshToken  String
  tokenExpiry   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Services

- **`gmailAuthService.ts`**: Xử lý Gmail OAuth flow
- **`oauthServer.ts`**: Express server để nhận OAuth callback
- **`emailRepository.ts`**: Quản lý database operations cho user email

### Commands

- **`login.ts`**: Xử lý lệnh `*login`
- **`logout.ts`**: Xử lý lệnh `*logout`

## Permissions (OAuth Scopes)

Bot yêu cầu các quyền sau:

- `https://www.googleapis.com/auth/gmail.readonly` - Đọc email
- `https://www.googleapis.com/auth/gmail.send` - Gửi email
- `https://www.googleapis.com/auth/gmail.modify` - Sửa đổi email (đánh dấu đã đọc, xóa, v.v.)

## Bảo mật

- Access tokens và refresh tokens được mã hóa trong database
- OAuth state parameter chứa mezonUserId để tracking
- Tokens tự động refresh khi hết hạn
- User có thể ngắt kết nối bất cứ lúc nào bằng `*logout`

## Các bước tiếp theo (Tính năng có thể mở rộng)

1. **`*inbox`** - Hiển thị danh sách email mới nhất
2. **`*read <id>`** - Đọc email cụ thể
3. **`*send`** - Gửi email mới
4. **`*reply <id>`** - Trả lời email
5. **Notifications** - Tự động thông báo khi có email mới
6. **`*search <query>`** - Tìm kiếm email
7. **`*labels`** - Quản lý labels/folders

## Xử lý lỗi

- Nếu OAuth flow thất bại, user nhận message lỗi và có thể thử lại
- Nếu tokens hết hạn, bot tự động refresh bằng refresh token
- Nếu refresh token không hợp lệ, user cần login lại

## Development

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Troubleshooting

### Lỗi "Missing required env var"

Kiểm tra file `.env` có đầy đủ các biến cần thiết.

### OAuth callback không hoạt động

1. Kiểm tra `GMAIL_REDIRECT_URI` trong `.env` khớp với redirect URI trong Google Cloud Console
2. Kiểm tra callback server đang chạy trên đúng port
3. Kiểm tra firewall không block port 3000

### User không nhận được DM

Kiểm tra bot có quyền gửi DM cho user không.

## License

MIT
