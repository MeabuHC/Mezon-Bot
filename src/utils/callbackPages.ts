/**
 * HTML templates for OAuth callback pages
 */

export function renderSuccessPage(email?: string | null): string {
  const emailDisplay = email ? ` (${email})` : "";
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorization Successful - Mailzon</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 20px;
    }
    .container {
      background: white;
      padding: 3rem 2.5rem;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
      width: 100%;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #4CAF50;
      margin-bottom: 1rem;
      font-size: 1.8rem;
      font-weight: 600;
    }
    .email {
      color: #667eea;
      font-weight: 600;
      font-size: 1.1rem;
      margin: 0.5rem 0;
      word-break: break-all;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin: 0.5rem 0;
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">✅</div>
    <h1>Authorization Successful!</h1>
    <p>Your Gmail account${emailDisplay} has been connected successfully.</p>
    ${email ? `<div class="email">${email}</div>` : ""}
    <p>You can close this window and return to the bot.</p>
    <div class="footer">
      <p>Powered by Mailzon</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function renderErrorPage(title: string, message: string, details?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Mailzon</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      padding: 20px;
    }
    .container {
      background: white;
      padding: 3rem 2.5rem;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
      width: 100%;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #f5576c;
      margin-bottom: 1rem;
      font-size: 1.8rem;
      font-weight: 600;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin: 0.5rem 0;
    }
    .details {
      background: #f8f9fa;
      padding: 1rem;
      border-radius: 8px;
      margin: 1rem 0;
      color: #555;
      font-size: 0.9rem;
      word-break: break-word;
    }
    .action {
      margin-top: 1.5rem;
      padding: 0.75rem 1.5rem;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      text-decoration: none;
      display: inline-block;
      transition: background 0.2s;
    }
    .action:hover {
      background: #5568d3;
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">❌</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
    <p>Please try again by running the <code>*login</code> command in the bot.</p>
    <div class="footer">
      <p>Powered by Mailzon</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function renderDeniedPage(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Access Denied - Mailzon</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      padding: 20px;
    }
    .container {
      background: white;
      padding: 3rem 2.5rem;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      text-align: center;
      max-width: 500px;
      width: 100%;
      animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #f5576c;
      margin-bottom: 1rem;
      font-size: 1.8rem;
      font-weight: 600;
    }
    p {
      color: #666;
      line-height: 1.6;
      margin: 0.5rem 0;
    }
    .info {
      background: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 1rem;
      border-radius: 8px;
      margin: 1.5rem 0;
      text-align: left;
    }
    .info p {
      color: #856404;
      margin: 0.25rem 0;
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🚫</div>
    <h1>Access Denied</h1>
    <p>You chose not to authorize Mailzon to access your Gmail account.</p>
    <div class="info">
      <p><strong>No data was accessed.</strong></p>
      <p>Your Gmail account remains secure and unchanged.</p>
    </div>
    <p>If you change your mind, you can run the <code>*login</code> command again in the bot.</p>
    <div class="footer">
      <p>Powered by Mailzon</p>
    </div>
  </div>
</body>
</html>
  `;
}

