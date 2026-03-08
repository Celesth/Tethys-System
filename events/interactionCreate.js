const { Events, EmbedBuilder, MessageFlags } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    // Interaction tokens expire after 3 seconds if not acknowledged.
    // This can happen if the bot restarted while Discord was still sending the interaction.
    // We check age before even trying to defer.
    const age = Date.now() - interaction.createdTimestamp;
    if (age > 2500) {
      console.warn(`[InteractionCreate] Interaction for /${interaction.commandName} is already ${age}ms old — skipping (expired)`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      // 10062 = unknown interaction (expired token) — nothing we can do, just log it
      if (err.code === 10062) {
        console.warn(`[InteractionCreate] Interaction expired for /${interaction.commandName} — user needs to run the command again`);
        return;
      }

      console.error(`[InteractionCreate] Error in /${interaction.commandName}:`, err);

      const errEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Command Error')
      .setDescription(`\`${err.message}\``);

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errEmbed] });
        } else {
          await interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
        }
      } catch { /* interaction already gone */ }
    }
  },
};
