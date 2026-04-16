const { Events } = require('discord.js');
const { checkPerms } = require('../utils/checkPerms');

const COMPONENT_HANDLERS = new Map();

function registerHandler(prefix, handler, module) {
  if (!handler) return;
  COMPONENT_HANDLERS.set(prefix, { handler, module });
}

function loadHandlers() {
  const modules = [
    ['say:',     () => require('../commands/utility/say')],
    ['roulette:', () => require('../commands/fun/roulette')],
    ['dc:',      () => require('../commands/fun/domainclash')],
    ['dp:',      () => require('../commands/fun/domainPrefix')],
    ['ra:',      () => require('../commands/moderation/roleadmin')],
  ];

  for (const [prefix, loader] of modules) {
    try {
      const mod = loader();
      if (mod.handleComponent) {
        registerHandler(prefix, mod.handleComponent, mod);
        console.log(`[COMP] Registered handler for "${prefix}"`);
      }
    } catch (err) {
      console.warn(`[COMP] No handler for "${prefix}" (may not exist yet):`, err.message);
    }
  }
}

loadHandlers();

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        if (Date.now() - interaction.createdTimestamp > 2500) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;

        const perm = checkPerms(interaction);
        if (!perm.allowed) {
          return interaction.reply({ content: perm.message, flags: 64 });
        }

        try {
          await command.execute(interaction);
        } catch (err) {
          console.error(`[ERROR] /${interaction.commandName}:`, err);
          await handleCommandError(interaction, err);
        }
        return;
      }

      if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) {
        for (const [prefix, { handler }] of COMPONENT_HANDLERS) {
          if (interaction.customId.startsWith(prefix)) {
            try {
              await handler(interaction);
            } catch (err) {
              console.error(`[ERROR] Component handler (${prefix}):`, err);
              await handleComponentError(interaction, err);
            }
            return;
          }
        }
      }
    } catch (err) {
      console.error('[FATAL] interactionCreate error:', err);
    }
  },
};

async function handleCommandError(interaction, err) {
  const msg = { content: '❌ Something went wrong running that command.', flags: 64 };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else {
      await interaction.reply(msg);
    }
  } catch { /* already gone */ }
}

async function handleComponentError(interaction, err) {
  const msg = { content: '❌ Something went wrong. Please try again.', flags: 64 };
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(msg);
    } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
      await interaction.reply(msg);
    }
  } catch { /* already gone */ }
}
