const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { createBackup } = require('../services/BackupService');

module.exports = {
  data: new SlashCommandBuilder()
  .setName('backup-create')
  .setDescription('Backup a category (forums, threads, channels)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(opt =>
  opt.setName('categories')
  .setDescription('Category names or IDs to backup (comma-separated). Leave empty for ALL.')
  .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild          = interaction.guild;
    const input          = interaction.options.getString('categories');
    const categoryFilter = input ? input.split(',').map(s => s.trim()) : null;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('[System] Backup Starting...')
        .setDescription(categoryFilter
        ? `Backing up: **${categoryFilter.join(', ')}**`
        : 'Backing up **all categories**...')
        .setFooter({ text: 'This may take a while — Tethys will update this message when done' }),
      ],
    });

    try {
      const results = await createBackup(guild, { categoryFilter });

      if (!results.length) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
            .setColor(0xFEE75C)
            .setTitle('Nothing to Backup')
            .setDescription('No matching categories found.'),
          ],
        });
      }

      const embed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle(`[System] Backup Complete — ${results.length} categor${results.length === 1 ? 'y' : 'ies'}`)
      .setTimestamp();

      for (const r of results) {
        // BackupService returns { folderName, folderPath, categoryName, stats }
        const s = r.stats ?? {};
        embed.addFields({
          name: `📁 ${r.categoryName ?? r.folderName}`,
          value: [
            `\`📂 ${r.folderName}\``,
            `💬 ${s.totalForums ?? 0} forums • #️⃣ ${s.totalChannels ?? 0} channels • 🧵 ${s.totalThreads ?? 0} threads • 💌 ${s.totalMessages ?? 0} messages`,
          ].join('\n'),
                        inline: false,
        });
      }

      embed.setFooter({ text: 'Use /backup-list to manage backups' });
      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('[backup-create]', err);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Backup Failed')
          .setDescription(`\`${err.message}\``),
        ],
      });
    }
  },
};
