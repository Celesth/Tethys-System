const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, MessageFlags } = require('discord.js');
  const { restoreBackup, getBackupInfo } = require('../services/BackupService');

  module.exports = {
    data: new SlashCommandBuilder()
    .setName('backup-restore')
    .setDescription('Restore a category backup to this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
    opt.setName('folder')
    .setDescription('Backup folder name (from /backup-list)')
    .setRequired(true))
    .addBooleanOption(opt =>
    opt.setName('clear')
    .setDescription('Delete ALL existing channels before restoring? (DANGEROUS)')
    .setRequired(false)),

    async execute(interaction) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const folder       = interaction.options.getString('folder');
      const clearExisting = interaction.options.getBoolean('clear') ?? false;
      const meta         = getBackupInfo(folder);

      if (!meta) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Backup Not Found')
            .setDescription(`No backup at folder \`${folder}\``),
          ],
        });
      }

      const s = meta.stats;
      const confirmEmbed = new EmbedBuilder()
      .setColor(clearExisting ? 0xED4245 : 0xFEE75C)
      .setTitle(clearExisting ? '⚠️ DESTRUCTIVE RESTORE' : '⚠️ Confirm Restore')
      .setDescription([
        `Restoring category **${meta.name}** from \`${folder}\``,
        '',
        clearExisting ? '🔴 **All existing channels will be DELETED first!**' : '🟡 Channels will be added without clearing existing ones.',
        '',
        `💬 ${s.totalForums} forums • 🧵 ${s.totalThreads} threads • 💌 ${s.totalMessages} messages`,
      ].join('\n'));

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('yes').setLabel(clearExisting ? 'Clear & Restore' : 'Restore').setStyle(clearExisting ? ButtonStyle.Danger : ButtonStyle.Primary),
                                                       new ButtonBuilder().setCustomId('no').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );

      const reply = await interaction.editReply({ embeds: [confirmEmbed], components: [row] });

      let confirmed = false;
      try {
        const btn = await reply.awaitMessageComponent({ componentType: ComponentType.Button, filter: i => i.user.id === interaction.user.id, time: 30_000 });
        confirmed = btn.customId === 'yes';
        await btn.deferUpdate();
      } catch { /* timed out */ }

      if (!confirmed) {
        return interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle('🚫 Cancelled')],
                                     components: [],
        });
      }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle('⏳ Restoring...')
          .setDescription('Recreating channels and repopulating threads. Please wait.'),
        ],
        components: [],
      });

      try {
        const log = await restoreBackup(interaction.guild, folder, { clearExisting });
        const logText = log.join('\n').slice(0, 3800);

        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle('✅ Restore Complete')
            .setDescription(`Category **${meta.name}** restored.`)
            .addFields({ name: 'Log', value: `\`\`\`${logText}\`\`\`` }),
          ],
        });
      } catch (err) {
        console.error('[backup-restore]', err);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('❌ Restore Failed')
            .setDescription(`\`${err.message}\``),
          ],
        });
      }
    },
  };
