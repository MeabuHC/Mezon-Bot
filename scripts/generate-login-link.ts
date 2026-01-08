import { generateGmailOAuthUrl } from "../src/services/oauthService.js";
import { env } from "../src/config/env.js";
import "dotenv/config";

const TEST_USER_ID = "test_user_id";

async function generateLink() {
  if (!env.googleClientId || !env.oauthRedirectUri) {
    console.error("❌ Error: GOOGLE_CLIENT_ID or OAUTH_REDIRECT_URI not set in environment variables.");
    return;
  }

  const oauthUrl = generateGmailOAuthUrl(
    TEST_USER_ID,
    env.oauthRedirectUri,
    env.googleClientId
  );

  console.log("\n🔐 OAuth Login Link Generated:\n");
  console.log(oauthUrl);
  console.log("\n⚠️  Note: This is a test link with a dummy user ID.");
  console.log("   For production use, run the `*login` command in the bot to get a valid link.\n");
}

generateLink().catch(console.error);

