/**
 * HTML templates for OAuth callback pages
 */

export function renderSuccessPage(email?: string | null): string {
  const emailDisplay = email ? email : "your account";
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
      overflow: hidden;
    }
    .background {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    .particles {
      position: absolute;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .particle {
      position: absolute;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      animation: float 15s infinite ease-in-out;
    }
    @keyframes float {
      0%, 100% {
        transform: translateY(0) translateX(0);
        opacity: 0;
      }
      50% {
        opacity: 1;
      }
    }
    .container {
      position: relative;
      z-index: 1;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 3.5rem 2.5rem;
      border-radius: 24px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 520px;
      width: 100%;
      animation: slideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .success-icon {
      width: 100px;
      height: 100px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
      box-shadow: 0 10px 30px rgba(76, 175, 80, 0.3);
      position: relative;
    }
    .success-icon svg {
      width: 56px;
      height: 56px;
      fill: white;
      animation: checkmark 0.6s cubic-bezier(0.65, 0, 0.45, 1) 0.4s both;
    }
    @keyframes checkmark {
      0% {
        transform: scale(0);
        opacity: 0;
      }
      50% {
        transform: scale(1.1);
      }
      100% {
        transform: scale(1);
        opacity: 1;
      }
    }
    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }
    h1 {
      color: #2d3748;
      margin-bottom: 0.75rem;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #718096;
      font-size: 1rem;
      margin-bottom: 1.5rem;
      line-height: 1.6;
    }
    .email-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 1rem;
      margin: 1rem 0 2rem;
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
      animation: fadeInUp 0.5s ease-out 0.3s both;
    }
    @keyframes fadeInUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .email-icon {
      font-size: 1.2rem;
    }
    .message {
      color: #718096;
      font-size: 0.95rem;
      margin-top: 1.5rem;
      line-height: 1.6;
    }
    .footer {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0,0,0,0.1);
      color: #a0aec0;
      font-size: 0.875rem;
    }
    .footer-brand {
      font-weight: 600;
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="background">
    <div class="particles" id="particles"></div>
  </div>
  <div class="container">
    <div class="success-icon">
      <svg viewBox="0 0 24 24">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
      </svg>
    </div>
    <h1>Successfully Connected!</h1>
    <p class="subtitle">Your Gmail account has been linked to Mailzon</p>
    ${email ? `<div class="email-badge"><span class="email-icon">📧</span><span>${email}</span></div>` : ""}
    <p class="message">Opening Mailzon app...</p>
    <div class="footer">
      <p>Powered by <span class="footer-brand">Mailzon</span></p>
    </div>
  </div>
  <script>
    // Create animated particles
    function createParticles() {
      const particlesContainer = document.getElementById('particles');
      for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const size = Math.random() * 100 + 50;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = Math.random() * 100 + '%';
        particle.style.animationDelay = Math.random() * 15 + 's';
        particle.style.animationDuration = (Math.random() * 10 + 10) + 's';
        particlesContainer.appendChild(particle);
      }
    }
    createParticles();

    // Automatically attempt to open the app when page loads
    (function() {
      const userAgent = navigator.userAgent.toLowerCase();
      const isAndroid = /android/i.test(userAgent);
      const isIOS = /iphone|ipad|ipod/i.test(userAgent);
      
      // Deep link schemes to try
      const schemes = [
        'mezon://open',
        'mezon://',
        'mailzon://open',
        'mailzon://'
      ];
      
      // Android Intent URL format
      const androidIntent = 'intent://open#Intent;scheme=mezon;package=com.mezon.app;end';
      
      function attemptOpenApp() {
        if (isAndroid) {
          // Try Android Intent first
          window.location.href = androidIntent;
          // Fallback to regular deep link after a delay
          setTimeout(() => {
            window.location.href = schemes[0];
          }, 500);
        } else if (isIOS) {
          // Try iOS deep link
          window.location.href = schemes[0];
          // Fallback to App Store or web after delay
          setTimeout(() => {
            // If app doesn't open, could redirect to App Store
            // window.location.href = 'https://apps.apple.com/app/mezon';
          }, 1000);
        } else {
          // Desktop - try deep link (may not work but worth trying)
          window.location.href = schemes[0];
        }
      }
      
      // Attempt to open app after a short delay (to let page render)
      setTimeout(attemptOpenApp, 500);
      
      // Update message after attempting
      setTimeout(() => {
        const messageEl = document.querySelector('.message');
        if (messageEl) {
          messageEl.textContent = 'You can close this window and return to Mailzon.';
        }
      }, 2000);
    })();
  </script>
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
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 3.5rem 2.5rem;
      border-radius: 24px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 520px;
      width: 100%;
      animation: slideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .error-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #f5576c 0%, #e63946 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
      box-shadow: 0 10px 30px rgba(245, 87, 108, 0.3);
    }
    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }
    h1 {
      color: #2d3748;
      margin-bottom: 0.75rem;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p {
      color: #718096;
      line-height: 1.6;
      margin: 0.5rem 0;
    }
    .details {
      background: #f7fafc;
      padding: 1.25rem;
      border-radius: 12px;
      margin: 1.5rem 0;
      color: #4a5568;
      font-size: 0.9rem;
      word-break: break-word;
      border-left: 4px solid #f5576c;
      text-align: left;
    }
    .action-btn {
      margin-top: 2rem;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
    }
    .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(102, 126, 234, 0.4);
    }
    .footer {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0,0,0,0.1);
      color: #a0aec0;
      font-size: 0.875rem;
    }
    .footer-brand {
      font-weight: 600;
      color: #667eea;
    }
    code {
      background: #edf2f7;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">❌</div>
    <h1>${title}</h1>
    <p>${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
    <p>Please try again by running the <code>*login</code> command in the bot.</p>
    <a href="#" onclick="window.close(); return false;" class="action-btn">
      <span>Close Window</span>
    </a>
    <div class="footer">
      <p>Powered by <span class="footer-brand">Mailzon</span></p>
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
      background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
      padding: 20px;
    }
    .container {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 3.5rem 2.5rem;
      border-radius: 24px;
      box-shadow: 0 25px 80px rgba(0,0,0,0.2);
      text-align: center;
      max-width: 520px;
      width: 100%;
      animation: slideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      border: 1px solid rgba(255, 255, 255, 0.3);
    }
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .denied-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
      background: linear-gradient(135deg, #ffc107 0%, #ff9800 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2.5rem;
      animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both;
      box-shadow: 0 10px 30px rgba(255, 193, 7, 0.3);
    }
    @keyframes scaleIn {
      from {
        transform: scale(0);
      }
      to {
        transform: scale(1);
      }
    }
    h1 {
      color: #2d3748;
      margin-bottom: 0.75rem;
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    p {
      color: #718096;
      line-height: 1.6;
      margin: 0.5rem 0;
    }
    .info {
      background: #fff8e1;
      border-left: 4px solid #ffc107;
      padding: 1.25rem;
      border-radius: 12px;
      margin: 1.5rem 0;
      text-align: left;
    }
    .info p {
      color: #856404;
      margin: 0.5rem 0;
    }
    .info strong {
      color: #f57c00;
    }
    .action-btn {
      margin-top: 2rem;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.3s ease;
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
    }
    .action-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 12px 30px rgba(102, 126, 234, 0.4);
    }
    .footer {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid rgba(0,0,0,0.1);
      color: #a0aec0;
      font-size: 0.875rem;
    }
    .footer-brand {
      font-weight: 600;
      color: #667eea;
    }
    code {
      background: #edf2f7;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      color: #667eea;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="denied-icon">🚫</div>
    <h1>Access Denied</h1>
    <p>You chose not to authorize Mailzon to access your Gmail account.</p>
    <div class="info">
      <p><strong>No data was accessed.</strong></p>
      <p>Your Gmail account remains secure and unchanged.</p>
    </div>
    <p>If you change your mind, you can run the <code>*login</code> command again in the bot.</p>
    <a href="#" onclick="window.close(); return false;" class="action-btn">
      <span>Close Window</span>
    </a>
    <div class="footer">
      <p>Powered by <span class="footer-brand">Mailzon</span></p>
    </div>
  </div>
</body>
</html>
  `;
}
