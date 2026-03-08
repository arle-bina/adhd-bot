import "dotenv/config";

const required = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_CLIENT_ID",
  "GAME_API_URL",
  "GAME_API_KEY",
] as const;

export function validateEnv() {
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("Missing required environment variables:");
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
  }
}
