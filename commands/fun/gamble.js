const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

// ── Persistence ────────────────────────────────────────────────
const DATA_DIR    = path.join(__dirname, '..', '..', 'data');
const GAMBLE_FILE = path.join(DATA_DIR, 'gamble.json');
const COOLDOWN_MS = 30 * 1000; // 30 seconds between gambles

function loadStats() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (!fs.existsSync(GAMBLE_FILE)) return {};
        return JSON.parse(fs.readFileSync(GAMBLE_FILE, 'utf8'));
    } catch { return {}; }
}

function saveStats(data) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(GAMBLE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('[gamble] Failed to save:', err.message);
    }
}

function getUser(db, guildId, userId) {
    if (!db[guildId])         db[guildId] = {};
    if (!db[guildId][userId]) db[guildId][userId] = { wins: 0, losses: 0, streak: 0, lastPlayed: 0 };
    return db[guildId][userId];
}

// ── Flavour text ───────────────────────────────────────────────
const WIN_LINES = [
    "Fortune favours you today.",
"The coin spins your way.",
"Lady Luck smiles.",
"You called it perfectly.",
"Heads. You win. This time.",
];
const LOSE_LINES = [
    "The coin betrays you.",
"Not this time.",
"That's rough. Try again.",
"The house remembers.",
"Tails. Better luck next flip.",
];

module.exports = {
    data: new SlashCommandBuilder()
    .setName('gamble')
    .setDescription('Flip a coin — 50/50 chance to win or lose')
    .addSubcommand(sub =>
    sub.setName('flip')
    .setDescription('Flip the coin')
    .addStringOption(opt =>
    opt.setName('call')
    .setDescription('Call it before it lands')
    .setRequired(false)
    .addChoices(
        { name: '🪙 Heads', value: 'heads' },
        { name: '🪙 Tails', value: 'tails' },
    )))
    .addSubcommand(sub =>
    sub.setName('stats')
    .setDescription('View your or another user\'s gamble record')
    .addUserOption(opt =>
    opt.setName('user').setDescription('User to check (defaults to you)').setRequired(false))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'stats') {
            const target = interaction.options.getUser('user') ?? interaction.user;
            const db     = loadStats();
            const stats  = getUser(db, interaction.guildId, target.id);
            const total  = stats.wins + stats.losses;
            const rate   = total ? ((stats.wins / total) * 100).toFixed(1) : '—';

            const embed = new EmbedBuilder()
            .setColor(0xcba6f7)
            .setTitle(`🎲 Gamble stats — ${target.username}`)
            .setThumbnail(target.displayAvatarURL())
            .addFields(
                { name: '✅ Wins',     value: `${stats.wins}`,         inline: true },
                { name: '❌ Losses',   value: `${stats.losses}`,       inline: true },
                { name: '📊 Win rate', value: `${rate}%`,              inline: true },
                { name: '🔥 Streak',   value: stats.streak > 0
                    ? `${stats.streak}W`
                    : stats.streak < 0
                    ? `${Math.abs(stats.streak)}L`
                    : '—',                                           inline: true },
                    { name: '🎲 Total',    value: `${total}`,              inline: true },
            )
            .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ── flip ────────────────────────────────────────────────────
        const db    = loadStats();
        const stats = getUser(db, interaction.guildId, interaction.user.id);

        // Cooldown
        const since = Date.now() - stats.lastPlayed;
        if (since < COOLDOWN_MS) {
            const wait = Math.ceil((COOLDOWN_MS - since) / 1000);
            return interaction.reply({
                content: `⏳ Slow down — you can gamble again in **${wait}s**.`,
                ephemeral: true,
            });
        }

        const call   = interaction.options.getString('call'); // null if not provided
        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const won    = call ? call === result : Math.random() < 0.5; // if no call, pure 50/50

        // Update stats
        stats.lastPlayed = Date.now();
        if (won) {
            stats.wins++;
            stats.streak = stats.streak >= 0 ? stats.streak + 1 : 1;
        } else {
            stats.losses++;
            stats.streak = stats.streak <= 0 ? stats.streak - 1 : -1;
        }
        saveStats(db);

        const total   = stats.wins + stats.losses;
        const winRate = ((stats.wins / total) * 100).toFixed(1);
        const flavour = won
        ? WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)]
        : LOSE_LINES[Math.floor(Math.random() * LOSE_LINES.length)];

        const streakStr = stats.streak > 1
        ? `🔥 ${stats.streak} win streak!`
        : stats.streak < -1
        ? `💀 ${Math.abs(stats.streak)} loss streak`
        : '';

        const embed = new EmbedBuilder()
        .setColor(won ? 0xa6e3a1 : 0xf38ba8)
        .setTitle(won ? '✅ You win!' : '❌ You lose.')
        .setDescription(
            `*${flavour}*\n\n` +
            (call ? `You called **${call}** — landed **${result}**.\n` : `Coin landed on **${result}**.\n`) +
            (streakStr ? `\n${streakStr}` : '')
        )
        .addFields(
            { name: 'Wins',    value: `${stats.wins}`,    inline: true },
            { name: 'Losses',  value: `${stats.losses}`,  inline: true },
            { name: 'Win rate', value: `${winRate}%`,     inline: true },
        )
        .setFooter({ text: `${interaction.user.username} · 30s cooldown` })
        .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
