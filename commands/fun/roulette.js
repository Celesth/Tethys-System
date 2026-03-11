/**
 * roulette.js — Multiplayer Russian Roulette
 *
 * Difficulties (only affect vs_bot mode):
 *   easy    — bot loses 80% of the time, survival on dodge: 60%
 *   medium  — bot loses 50%, survival: 35%
 *   hard    — bot loses 25%, survival: 20%
 *   tethys  — bot loses 10%, survival: 5%
 *
 * Flow:
 *   1. /roulette → 30s join window with public Join button
 *   2. Timer fires → weighted spin picks a loser
 *   3. Human loser → warning embed + 🎲 Dodge button (5s)
 *      - Click in time → second RNG roll at survivalChance %
 *      - Don't click   → confirmed loss
 *   4. Bot loser → shame embed
 *   5. No mutes — shame only
 *   6. Join button always goes dead after 5 min
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

const JOIN_WINDOW_MS  = 30_000;
const BTN_EXPIRE_MS   = 5 * 60_000;
const SPIN_PAUSE_MS   = 2_500;
const DODGE_WINDOW_MS = 5_000;

const DIFFICULTIES = {
    easy:   { botLoseChance: 80, survivalChance: 60, label: 'Easy',   emoji: '🟢' },
    medium: { botLoseChance: 50, survivalChance: 35, label: 'Medium', emoji: '🟡' },
    hard:   { botLoseChance: 25, survivalChance: 20, label: 'Hard',   emoji: '🔴' },
    tethys: { botLoseChance: 10, survivalChance: 5,  label: 'Tethys', emoji: '💀' },
};

// messageId → { players, hasBot, difficulty, channelId, timer, expireTimer }
const activeGames = new Map();

// userId → { resolve, timeout, message, loserId, d, game } — pending gun choice
const pendingGun = new Map();

// ── UI ─────────────────────────────────────────────────────────
function joinRow(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('roulette:join')
        .setLabel(disabled ? 'Chamber closed' : 'Join the chamber')
        .setEmoji(disabled ? '🔒' : '🔫')
        .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Danger)
        .setDisabled(disabled),
    );
}

function listPlayers(players, botId, hasBot) {
    const lines = [...players].map(id => `🔫 <@${id}>`);
    if (hasBot) lines.push(`🤖 <@${botId}>`);
    return lines.length ? lines.join('\n') : '*Nobody…*';
}

function waitingEmbed(players, botId, hasBot, secondsLeft, diff) {
    const d = DIFFICULTIES[diff];
    const botLine = hasBot
    ? `\n🤖 Bot is in on **${d.emoji} ${d.label}** — ` +
    `bot loses **${d.botLoseChance}%** of spins · dodge survival **${d.survivalChance}%**\n`
    : '';

    return new EmbedBuilder()
    .setColor(0x89b4fa)
    .setTitle('🔫 Russian Roulette — Join now!')
    .setDescription(
        `Click **Join the chamber** before time runs out.\n` +
        `One player gets shot — no mutes, just shame.` +
        botLine +
        `\n⏳ **${secondsLeft}s** remaining`
    )
    .addFields({
        name:  `In the chamber (${players.size + (hasBot ? 1 : 0)})`,
               value: listPlayers(players, botId, hasBot),
    });
}

// ── Weighted pick ──────────────────────────────────────────────
function pickLoser(players, botId, hasBot, d) {
    if (!hasBot) {
        return players[Math.floor(Math.random() * players.length)];
    }
    const humanWeight = Math.max(1, Math.floor((100 - d.botLoseChance) / Math.max(players.length, 1)));
    const pool = [
        ...Array(d.botLoseChance).fill(botId),
        ...players.flatMap(id => Array(humanWeight).fill(id)),
    ];
    return pool[Math.floor(Math.random() * pool.length)];
}

// ── Main fire ──────────────────────────────────────────────────
async function fireRoulette(client, messageId, channelId) {
    const game = activeGames.get(messageId);
    if (!game) return;
    clearTimeout(game.expireTimer);

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) { activeGames.delete(messageId); return; }
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) { activeGames.delete(messageId); return; }

    const players = [...game.players];
    const botId   = client.user.id;
    const d       = DIFFICULTIES[game.difficulty];
    const pool    = [...players, ...(game.hasBot ? [botId] : [])];

    // ── Not enough players ───────────────────────────────────────
    if (pool.length < 2) {
        await message.edit({
            embeds: [
                new EmbedBuilder()
                .setColor(0xa6e3a1)
                .setTitle('😮‍💨 Click. — Empty chamber')
                .setDescription('Not enough players joined. Everyone lives.\n*(Need at least 2 to spin)*'),
            ],
            components: [joinRow(true)],
        }).catch(() => {});
        activeGames.delete(messageId);
        return;
    }

    // Spin animation
    await message.edit({
        embeds: [
            new EmbedBuilder()
            .setColor(0xf9e2af)
            .setTitle('🌀 Spinning the cylinder…')
            .setDescription('*The chamber rotates. One bullet. Many fates.*')
            .addFields({ name: 'Players', value: listPlayers(game.players, botId, game.hasBot) }),
        ],
        components: [joinRow(true)],
    }).catch(() => {});
    await new Promise(r => setTimeout(r, SPIN_PAUSE_MS));

    const loserId = pickLoser(players, botId, game.hasBot, d);

    // ── Bot lost ─────────────────────────────────────────────────
    if (loserId === botId) {
        const lines = [
            '"I calculated a 0% chance of this. I was wrong."',
            '"Statistical anomaly. Definitely."',
            '"This never happened. You saw nothing."',
            '"Even machines fall to fate."',
            game.difficulty === 'tethys'
            ? '"IMPOSSIBLE. SYSTEM ERROR. THIS CANNOT BE."'
            : '"Hm. Unexpected output."',
        ];
        await message.edit({
            embeds: [
                new EmbedBuilder()
                .setColor(0xcba6f7)
                .setTitle(`🤖💥 The bot took the bullet! [${d.emoji} ${d.label}]`)
                .setDescription(
                    `Against **${d.botLoseChance}%** odds — **Tethys lost.**\n` +
                    `*${lines[Math.floor(Math.random() * lines.length)]}*\n\n` +
                    `*(Bots cannot be shamed. But this embed documents it forever.)*`
                )
                .addFields({ name: 'Players', value: listPlayers(game.players, botId, game.hasBot) })
                .setTimestamp(),
            ],
            components: [],
        }).catch(() => {});
        activeGames.delete(messageId);
        return;
    }

    // ── Human lost — send ephemeral with 3 choices ──────────────
    // Update public embed to show we're waiting on the loser
    await message.edit({
        embeds: [
            new EmbedBuilder()
            .setColor(0xf38ba8)
            .setTitle('💢 The cylinder stopped…')
            .setDescription(
                `The gun is in <@${loserId}>'s hands.
                ` +
                `*Waiting for them to decide…*`
            )
            .addFields({ name: 'Players', value: listPlayers(game.players, botId, game.hasBot) })
            .setTimestamp(),
        ],
        components: [],
    }).catch(() => {});

    // Build the 3-button ephemeral row
    const gunRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('roulette:shoot')
        .setLabel('Shoot')
        .setEmoji('🔫')
        .setStyle(ButtonStyle.Danger),
                                                        new ButtonBuilder()
                                                        .setCustomId('roulette:roll')
                                                        .setLabel('Roll the magnum')
                                                        .setEmoji('🎲')
                                                        .setStyle(ButtonStyle.Primary),
                                                        new ButtonBuilder()
                                                        .setCustomId('roulette:hesitate')
                                                        .setLabel('Hesitate…')
                                                        .setEmoji('🤔')
                                                        .setStyle(ButtonStyle.Secondary),
    );

    // Send ephemeral prompt — only visible to the loser
    // We need a fresh interaction context; use a follow-up via the channel
    // since fireRoulette runs outside an interaction. We DM instead.
    const loserMember = channel.guild.members.cache.get(loserId)
    ?? await channel.guild.members.fetch(loserId).catch(() => null);

    const shootPct    = d.survivalChance;
    const rollPct     = Math.min(d.survivalChance + 15, 95);
    const hesitatePct = Math.max(d.survivalChance - 15, 1);
    const tethysLine  = game.difficulty === 'tethys'
    ? '\n\n\u26a0\ufe0f *You are on **\U0001f480 Tethys**. Fate is not interested in your hesitation.*'
    : '';

    const choiceEmbed = new EmbedBuilder()
    .setColor(0xf38ba8)
    .setTitle('\U0001f52b The gun is in your hands.')
    .setDescription(
        'You have **10 seconds** to choose:\n\n' +
        '\U0001f52b **Shoot** \u2014 pull the trigger straight away\n' +
        `   Survival chance: **${shootPct}%**\n\n` +
        '\U0001f3b2 **Roll the magnum** \u2014 spin the cylinder first, then shoot\n' +
        `   Survival chance: **${rollPct}%** *(re-spin bonus)*\n\n` +
        '\U0001f914 **Hesitate** \u2014 stall for 3s, then the trigger pulls itself\n' +
        `   Survival chance: **${hesitatePct}%** *(panic penalty)*` +
        tethysLine +
        '\n\n*If you don\'t choose in time \u2014 the gun fires itself.*'
    );

    // Try to DM the loser with the choice
    let dmSent = false;
    if (loserMember) {
        try {
            const dm = await loserMember.user.createDM();
            await dm.send({ embeds: [choiceEmbed], components: [gunRow] });
            dmSent = true;

            // Also send a ping in the channel so they know to check DMs
            await channel.send({
                content: `<@${loserId}> — **check your DMs!** The gun is waiting.`,
                allowedMentions: { users: [loserId] },
            }).catch(() => {});
        } catch { dmSent = false; }
    }

    // Fallback: if DMs are closed, post publicly with a note
    if (!dmSent) {
        await channel.send({
            content: `<@${loserId}> *(DMs closed — posting publicly)*`,
                           embeds:  [choiceEmbed],
                           components: [gunRow],
        }).catch(() => {});
    }

    // Wait for their choice (10s window)
    const CHOICE_WINDOW = 10_000;
    const choice = await new Promise(resolve => {
        const timeout = setTimeout(() => {
            pendingGun.delete(loserId);
            resolve('timeout');
        }, CHOICE_WINDOW);
        pendingGun.set(loserId, { resolve, timeout, messageRef: message, d, game, botId, loserId });
    });

    // ── Resolve outcome based on choice ──────────────────────────
    let survivalPct;
    let outcomeTitle;
    let outcomeDesc;

    if (choice === 'shoot') {
        survivalPct  = d.survivalChance;
        outcomeTitle = '🔫 They pulled the trigger.';
        outcomeDesc  = `<@${loserId}> chose to shoot without hesitation.`;
    } else if (choice === 'roll') {
        survivalPct  = Math.min(d.survivalChance + 15, 95);
        outcomeTitle = '🎲 They rolled the magnum first…';
        outcomeDesc  = `<@${loserId}> spun the cylinder before shooting. Bold move.`;
    } else if (choice === 'hesitate') {
        survivalPct  = Math.max(d.survivalChance - 15, 1);
        outcomeTitle = '🤔 They hesitated — the gun fired itself.';
        outcomeDesc  = `<@${loserId}> stalled too long. The trigger pulled itself after 3 seconds.`;
    } else {
        // timeout — same as hesitate
        survivalPct  = Math.max(d.survivalChance - 15, 1);
        outcomeTitle = '⏱️ Time ran out. The gun fired itself.';
        outcomeDesc  = `<@${loserId}> never chose. The hammer fell on its own.`;
    }

    const survived = Math.random() * 100 < survivalPct;

    if (survived) {
        await message.edit({
            embeds: [
                new EmbedBuilder()
                .setColor(0xa6e3a1)
                .setTitle('😤 They survived!')
                .setDescription(
                    `${outcomeDesc}

                    ` +
                    `Against **${survivalPct}%** odds — **they lived.**
                    ` +
                    `*The chamber was empty. Everyone walks away.*`
                )
                .addFields({ name: 'Players', value: listPlayers(game.players, botId, game.hasBot) })
                .setTimestamp(),
            ],
            components: [],
        }).catch(() => {});
    } else {
        await message.edit({
            embeds: [
                new EmbedBuilder()
                .setColor(0xf38ba8)
                .setTitle(`💀 ${outcomeTitle}`)
                .setDescription(
                    `${outcomeDesc}

                    ` +
                    `The bullet found them. **${survivalPct}%** survival — not enough.

                    ` +
                    `*No mute. Just shame — forever enshrined in this embed.*`
                )
                .addFields({ name: 'Players', value: listPlayers(game.players, botId, game.hasBot) })
                .setTimestamp(),
            ],
            components: [],
        }).catch(() => {});
    }

    activeGames.delete(messageId);
}

// ── Exports ────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
    .setName('roulette')
    .setDescription('Start a Russian Roulette — 30s join window, one player gets shot (no mutes)')
    .addBooleanOption(opt =>
    opt.setName('vs_bot')
    .setDescription('Add the bot as a participant')
    .setRequired(false))
    .addStringOption(opt =>
    opt.setName('difficulty')
    .setDescription('Bot difficulty — only applies with vs_bot enabled')
    .setRequired(false)
    .addChoices(
        { name: '🟢 Easy   — bot barely tries (loses 80% of spins)',       value: 'easy'   },
                { name: '🟡 Medium — fair 50/50',                                   value: 'medium' },
                { name: '🔴 Hard   — bot is stacked (loses only 25% of spins)',     value: 'hard'   },
                { name: '💀 Tethys — near impossible. 5% survival. Good luck.',     value: 'tethys' },
    )),

    async execute(interaction) {
        const hasBot = interaction.options.getBoolean('vs_bot') ?? false;
        const diff   = interaction.options.getString('difficulty') ?? 'medium';
        const botId  = interaction.client.user.id;

        await interaction.deferReply();

        const players = new Set([interaction.user.id]);
        const reply   = await interaction.editReply({
            embeds:     [waitingEmbed(players, botId, hasBot, 30, diff)],
                                                    components: [joinRow()],
        });
        const message = await reply.fetch().catch(() => reply);
        const msgId   = message.id;
        const chanId  = interaction.channelId;
        const client  = interaction.client;

        const game = { players, hasBot, difficulty: diff, channelId: chanId, timer: null, expireTimer: null };
        activeGames.set(msgId, game);

        // Countdown ticker every 10s
        let elapsed = 0;
        const ticker = setInterval(async () => {
            elapsed += 10;
            const left = 30 - elapsed;
            if (left <= 0) { clearInterval(ticker); return; }
            const g = activeGames.get(msgId);
            if (!g) { clearInterval(ticker); return; }
            await message.edit({
                embeds:     [waitingEmbed(g.players, botId, g.hasBot, left, g.difficulty)],
                               components: [joinRow()],
            }).catch(() => clearInterval(ticker));
        }, 10_000);

        // Fire after 30s
        game.timer = setTimeout(() => {
            clearInterval(ticker);
            fireRoulette(client, msgId, chanId);
        }, JOIN_WINDOW_MS);

        // Hard-kill button after 5 min
        game.expireTimer = setTimeout(async () => {
            clearInterval(ticker);
            if (!activeGames.has(msgId)) return;
            activeGames.delete(msgId);
            await message.edit({ components: [joinRow(true)] }).catch(() => {});
        }, BTN_EXPIRE_MS);
    },

    async handleComponent(interaction) {
        if (!interaction.isButton()) return;

        // ── Join ──────────────────────────────────────────────────
        if (interaction.customId === 'roulette:join') {
            const game = activeGames.get(interaction.message.id);
            if (!game) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ This game has already ended.')],
                                         flags: 64,
                });
            }
            const userId = interaction.user.id;
            if (game.players.has(userId)) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xf9e2af).setDescription('⚠️ You\'re already in the chamber.')],
                                         flags: 64,
                });
            }
            game.players.add(userId);
            return interaction.update({
                embeds:     [waitingEmbed(game.players, interaction.client.user.id, game.hasBot, '?', game.difficulty)],
                                      components: [joinRow()],
            });
        }

        // ── Gun choices (shoot / roll / hesitate) ────────────────
        if (['roulette:shoot', 'roulette:roll', 'roulette:hesitate'].includes(interaction.customId)) {
            const userId  = interaction.user.id;
            const pending = pendingGun.get(userId);

            // Someone else clicked a button that wasn't meant for them
            if (!pending || pending.loserId !== userId) {
                return interaction.reply({
                    embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription("❌ This gun isn't yours.")],
                                         flags: 64,
                });
            }

            const choice = interaction.customId.replace('roulette:', '');

            // Disable the buttons immediately
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('roulette:shoot').setLabel('Shoot').setEmoji('🔫')
                .setStyle(ButtonStyle.Danger).setDisabled(true),
                                                                     new ButtonBuilder().setCustomId('roulette:roll').setLabel('Roll the magnum').setEmoji('🎲')
                                                                     .setStyle(ButtonStyle.Primary).setDisabled(true),
                                                                     new ButtonBuilder().setCustomId('roulette:hesitate').setLabel('Hesitate…').setEmoji('🤔')
                                                                     .setStyle(ButtonStyle.Secondary).setDisabled(true),
            );

            if (choice === 'hesitate') {
                // Acknowledge — stall 3s, then resolve
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xf9e2af)
                        .setTitle('🤔 Hesitating…')
                        .setDescription('*3 seconds. Then the trigger pulls itself.*'),
                    ],
                    components: [disabledRow],
                });
                setTimeout(() => {
                    clearTimeout(pending.timeout);
                    pendingGun.delete(userId);
                    pending.resolve('hesitate');
                }, 3_000);
            } else {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                        .setColor(0xf9e2af)
                        .setTitle(choice === 'shoot' ? '🔫 Trigger pulled…' : '🎲 Rolling the magnum…')
                        .setDescription('*Resolving…*'),
                    ],
                    components: [disabledRow],
                });
                clearTimeout(pending.timeout);
                pendingGun.delete(userId);
                pending.resolve(choice);
            }
            return;
        }
    },
};
