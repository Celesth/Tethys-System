require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];

function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith('.js')) {
      const command = require(fullPath);
      if (!command?.data?.toJSON) {
        console.warn(`[WARN] Skipping ${fullPath} — missing data export`);
        continue;
      }
      commands.push(command.data.toJSON());
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  console.log(`Deploying ${commands.length} slash commands...`);

  // Guild-specific deploy (instant, for testing)
  if (process.env.GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                   { body: commands }
    );
    console.log(`✅ Commands deployed to guild ${process.env.GUILD_ID}`);
  } else {
    // Global deploy (takes up to 1 hour to propagate)
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
                   { body: commands }
    );
    console.log('✅ Commands deployed globally');
  }
})().catch(console.error);
