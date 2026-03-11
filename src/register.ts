import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { validateEnv } from "./utils/env.js";

validateEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commandFiles = readdirSync(join(__dirname, "commands")).filter(
  (f) => f.endsWith(".js") || f.endsWith(".ts")
);

const commandData: unknown[] = [];

for (const file of commandFiles) {
  const baseName = file.replace(/\.(js|ts)$/, "");
  const mod = await import(`./commands/${baseName}.js`);
  if (mod.data) {
    commandData.push(mod.data.toJSON());
  }
}

const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

const GUILD_ID = "1465445442987888743";

try {
  console.log(`Registering ${commandData.length} slash commands to guild...`);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID!, GUILD_ID),
    { body: commandData }
  );
  console.log("Successfully registered commands.");
} catch (error) {
  console.error(error);
}
