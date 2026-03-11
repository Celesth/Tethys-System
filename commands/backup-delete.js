const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} = require('discord.js');
const { deleteBackup, getBackupInfo } = require('../services/BackupService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('backup-delete')
    .setDescription('Permanently delete a backup folder')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName('folder')
        .setDescription('Backup folder name (from /backup-list)')
        .setRequired(true)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const folder = interaction.options.getString('folder');
    const meta   = getBackupInfo(folder);

    if (!meta) {
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Not Found')
            .setDescription(`No backup at \`${folder}\``),
        ],
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('yes').setLabel('Delete').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const reply = await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🗑️ Confirm Deletion')
          .setDescription(`Delete backup **${meta.name}** (\`${folder}\`)?\n\nThis **cannot** be undone.`),
      ],
      components: [row],
    });

    let confirmed = false;
    try {
      const btn = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: i => i.user.id === interaction.user.id, time: 20_000 });
      confirmed = btn.customId === 'yes';
      await btn.deferUpdate();
    } catch { /* timed out */ }

    const success = confirmed && deleteBackup(folder);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(confirmed ? (success ? 0x57F287 : 0xED4245) : 0x99AAB5)
          .setTitle(confirmed ? (success ? '✅ Deleted' : '❌ Failed') : '🚫 Cancelled')
          .setDescription(confirmed ? (success ? `Backup **${meta.name}** deleted.` : 'Deletion failed.') : 'No action taken.'),
      ],
      components: [],
    });
  },
};
