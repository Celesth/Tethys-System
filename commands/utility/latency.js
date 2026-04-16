const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('latency')
        .setDescription('Check the bot\'s latency'),

    async execute(interaction) {
        const wsLatency = interaction.client.ws.ping;
        const apiStart = Date.now();

        try {
            await interaction.reply({ content: '🏓 Pong!' });
            const apiLatency = Date.now() - apiStart;

            const color = apiLatency < 100 ? 0xa6e3a1 : apiLatency < 300 ? 0xf9e2af : 0xf38ba8;

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('Latency')
                .addFields(
                    { name: 'WebSocket', value: `${wsLatency}ms`, inline: true },
                    { name: 'API Response', value: `${apiLatency}ms`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed], content: null }).catch(() => {});
        } catch (err) {
            console.error('[latency] Error:', err);
            await interaction.reply({ content: '❌ Failed to check latency.', flags: 64 }).catch(() => {});
        }
    },
};
