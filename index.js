require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

function loadCommands(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith('.js')) {
      try {
        const command = require(fullPath);
        if (!command?.data?.name) {
          console.warn(`[WARN] Skipping ${fullPath} — missing "data.name" export`);
          continue;
        }
        client.commands.set(command.data.name, command);
        console.log(`[CMD] Loaded ${command.data.name} (${path.relative(path.join(__dirname, 'commands'), fullPath)})`);
      } catch (err) {
        console.error(`[ERROR] Failed to load ${fullPath}:`, err.message);
      }
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
  try {
    const event = require(path.join(eventsPath, file));
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
    console.log(`[EVT] Loaded ${event.name}`);
  } catch (err) {
    console.error(`[ERROR] Failed to load event ${file}:`, err.message);
  }
}

const domainPrefixCmd = require('./commands/fun/domainPrefix');

client.on('messageCreate', async (message) => {
  try {
    if (message.author.bot) return;
    await domainPrefixCmd.handleMessage(message);
  } catch (err) {
    console.error('[messageCreate] domainPrefix error:', err);
  }
});

process.on('unhandledRejection', (err, promise) => {
  console.error('[UNHANDLED] Unhandled promise rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT] Uncaught exception:', err);
  process.exit(1);
});

client.on('shardDisconnect', (closeEvent) => {
  console.warn('[DISCONNECT] Bot disconnected:', closeEvent.code, closeEvent.reason);
});

client.on('shardReconnecting', (id) => {
  console.log(`[RECONNECT] Shard ${id} reconnecting...`);
});

client.on('shardResume', (id) => {
  console.log(`[RESUME] Shard ${id} resumed`);
});

client.login(process.env.DISCORD_TOKEN).catch((err) => {
  console.error('[FATAL] Failed to login:', err);
  process.exit(1);
});
