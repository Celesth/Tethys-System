const { Events } = require('discord.js');
const { checkPerms } = require('../utils/checkPerms');
const sayCmd     = require('../commands/utility/say');
// const roleAdmCmd    = require('../commands/moderation/roleadmin');
const rouletteCmd    = require('../commands/fun/roulette');
const domainClashCmd  = require('../commands/fun/domainclash');
const domainPrefixCmd = require('../commands/fun/domainPrefix');

module.exports = {
  name: Events.InteractionCreate,

  async execute(interaction) {

    // ── Slash commands ────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      // Drop stale interactions (avoids DiscordAPIError[10062])
      if (Date.now() - interaction.createdTimestamp > 2500) return;

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      // ── Permission check ────────────────────────────────────────
      const perm = checkPerms(interaction);
      if (!perm.allowed) {
        return interaction.reply({ content: perm.message, flags: 64 });
      }

      // ── Execute ─────────────────────────────────────────────────
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[ERROR] /${interaction.commandName}:`, err);
        const msg = { content: '❌ Something went wrong running that command.', flags: 64 };
        if (interaction.deferred || interaction.replied) interaction.editReply(msg).catch(() => {});
        else interaction.reply(msg).catch(() => {});
      }
      return;
    }

    // ── /say buttons + modal submits ─────────────────────────────
    if (
      (interaction.isButton()      && interaction.customId.startsWith('say:')) ||
      (interaction.isModalSubmit() && interaction.customId.startsWith('say:'))
    ) {
      try {
        await sayCmd.handleComponent(interaction);
      } catch (err) {
        console.error('[ERROR] /say component handler:', err);
      }
      return;
    }

    // ── /roulette join button ────────────────────────────────────
    if (interaction.isButton() && ['roulette:join','roulette:shoot','roulette:roll','roulette:hesitate'].includes(interaction.customId)) {
      try {
        await rouletteCmd.handleComponent(interaction);
      } catch (err) {
        console.error('[ERROR] /roulette component handler:', err);
      }
      return;
    }

    // ── /domainclash buttons + modals ────────────────────────────
    if (
      (interaction.isButton()      && interaction.customId.startsWith('dc:')) ||
      (interaction.isModalSubmit() && interaction.customId.startsWith('dc:'))
    ) {
      try {
        await domainClashCmd.handleComponent(interaction);
      } catch (err) {
        console.error('[ERROR] /domainclash component handler:', err);
      }
      return;
    }

    // ── >domain* prefix cmd buttons/modals/selects ───────────
    if (
      (interaction.isButton()            && interaction.customId.startsWith('dp:')) ||
      (interaction.isModalSubmit()       && interaction.customId.startsWith('dp:')) ||
      (interaction.isStringSelectMenu()  && interaction.customId.startsWith('dp:'))
    ) {
      try {
        await domainPrefixCmd.handleComponent(interaction);
      } catch (err) {
        console.error('[ERROR] domainPrefix component handler:', err);
      }
      return;
    }

    // ── /roleadmin DM select menus ────────────────────────────────
    // These arrive in DMs so interaction.guild is null — route by customId prefix
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ra:')) {
      try {
        await roleAdmCmd.handleComponent(interaction);
      } catch (err) {
        console.error('[ERROR] /roleadmin component handler:', err);
      }
      return;
    }
  },
};
