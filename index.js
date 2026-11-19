const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionFlagsBits,
  ActivityType
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
// Supports both config.json (local) and environment variables (Render / production)
let config = {};

const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  config = require('./config.json');
}

// Environment variables take priority (perfect for Render / GitHub deploys)
config.token = process.env.DISCORD_TOKEN || process.env.TOKEN || config.token;
config.clientId = process.env.CLIENT_ID || config.clientId;
config.guildId = process.env.GUILD_ID || config.guildId;

if (!config.token) {
  console.error('❌ No bot token found! Set DISCORD_TOKEN environment variable or create config.json');
  process.exit(1);
}

// ==================== DATA HELPERS ====================
const dataDir = path.join(__dirname, 'data');
const accountsPath = path.join(dataDir, 'accounts.json');
const invitesPath = path.join(dataDir, 'invites.json');
const settingsPath = path.join(dataDir, 'settings.json');

function loadJSON(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

let accounts = loadJSON(accountsPath, []);          // array of { content: string, addedBy: string, addedAt: number }
let inviteCounts = loadJSON(invitesPath, {});      // { userId: number }
let settings = loadJSON(settingsPath, { claimChannelId: null });

// In-memory invite cache for tracking joins
const inviteCache = new Map(); // guildId -> Collection of invites

// ==================== CLIENT ====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.GuildMember]
});

// ==================== READY ====================
client.once('ready', async () => {
  console.log(`✅ Falcon is online as ${client.user.tag}`);
  client.user.setActivity('Falcon | /claim', { type: ActivityType.Watching });

  // Cache invites for every guild
  for (const guild of client.guilds.cache.values()) {
    try {
      const invites = await guild.invites.fetch();
      inviteCache.set(guild.id, invites);
      console.log(`📥 Cached ${invites.size} invites for ${guild.name}`);
    } catch (err) {
      console.warn(`⚠️ Could not fetch invites for ${guild.name}: ${err.message}`);
    }
  }
});

// ==================== INVITE TRACKING ====================
client.on('inviteCreate', async (invite) => {
  try {
    const invites = await invite.guild.invites.fetch();
    inviteCache.set(invite.guild.id, invites);
  } catch {}
});

client.on('inviteDelete', async (invite) => {
  try {
    const invites = await invite.guild.invites.fetch();
    inviteCache.set(invite.guild.id, invites);
  } catch {}
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;
  try {
    const newInvites = await guild.invites.fetch();
    const oldInvites = inviteCache.get(guild.id) || new Map();

    // Find which invite was used
    let usedInvite = null;
    for (const [code, invite] of newInvites) {
      const old = oldInvites.get(code);
      if (old) {
        if (invite.uses > old.uses) {
          usedInvite = invite;
          break;
        }
      } else if (invite.uses > 0) {
        // Brand new invite that was just used
        usedInvite = invite;
        break;
      }
    }

    // Update cache
    inviteCache.set(guild.id, newInvites);

    if (usedInvite && usedInvite.inviter) {
      const inviterId = usedInvite.inviter.id;
      inviteCounts[inviterId] = (inviteCounts[inviterId] || 0) + 1;
      saveJSON(invitesPath, inviteCounts);
      console.log(`➕ ${member.user.tag} joined via ${usedInvite.inviter.tag} (now ${inviteCounts[inviterId]} invites)`);
    }
  } catch (err) {
    console.error('Invite tracking error:', err.message);
  }
});

// ==================== INTERACTION HANDLER ====================
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ---------- /claim ----------
  if (commandName === 'claim') {
    // Check if claim channel is set and user is in the correct channel
    if (settings.claimChannelId && interaction.channelId !== settings.claimChannelId) {
      return interaction.reply({
        content: `❌ You can only claim in <#${settings.claimChannelId}>.`,
        ephemeral: true
      });
    }

    const userId = interaction.user.id;
    const currentInvites = inviteCounts[userId] || 0;

    if (currentInvites < 2) {
      return interaction.reply({
        content: `❌ You need **2 invites** to claim 1 MCFA account.\nYou currently have **${currentInvites}** invite(s).`,
        ephemeral: true
      });
    }

    if (accounts.length === 0) {
      return interaction.reply({
        content: '❌ No MCFA accounts available right now. Please wait for an admin to restock.',
        ephemeral: true
      });
    }

    // Give the first account in the list
    const account = accounts.shift();
    inviteCounts[userId] = currentInvites - 2;
    saveJSON(accountsPath, accounts);
    saveJSON(invitesPath, inviteCounts);

    const embed = new EmbedBuilder()
      .setColor(0x00FF88)
      .setTitle('✅ MCFA Account Claimed!')
      .setDescription(account.content)
      .addFields(
        { name: 'Remaining Invites', value: `${inviteCounts[userId]}`, inline: true },
        { name: 'Accounts Left in Stock', value: `${accounts.length}`, inline: true }
      )
      .setFooter({ text: 'Falcon Bot • Enjoy your account' })
      .setTimestamp();

    // Try to DM the user first
    try {
      await interaction.user.send({ embeds: [embed] });
      await interaction.reply({
        content: '✅ Account sent to your DMs! Check your private messages.',
        ephemeral: true
      });
    } catch {
      // If DMs closed, reply ephemerally
      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }

    // Optional public log in the claim channel (without showing the actual account)
    if (settings.claimChannelId) {
      const logChannel = interaction.guild.channels.cache.get(settings.claimChannelId);
      if (logChannel && logChannel.id === interaction.channelId) {
        // Already in the claim channel, no extra log needed
      } else if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x5865F2)
          .setDescription(`🎉 **${interaction.user.tag}** claimed an MCFA account!`)
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] }).catch(() => {});
      }
    }
  }

  // ---------- /channel ----------
  if (commandName === 'channel') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    const channel = interaction.options.getChannel('channel');
    if (!channel || channel.type !== 0) { // 0 = GuildText
      return interaction.reply({ content: '❌ Please select a valid text channel.', ephemeral: true });
    }

    settings.claimChannelId = channel.id;
    saveJSON(settingsPath, settings);

    await interaction.reply({
      content: `✅ Claim channel set to ${channel}.\nUsers can now only use \`/claim\` in that channel.`,
      ephemeral: true
    });
  }

  // ---------- /mcfa ----------
  if (commandName === 'mcfa') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    const message = interaction.options.getString('message', true);

    accounts.push({
      content: message,
      addedBy: interaction.user.id,
      addedAt: Date.now()
    });
    saveJSON(accountsPath, accounts);

    await interaction.reply({
      content: `✅ MCFA account added to stock!\n**Total accounts available:** ${accounts.length}\n\nPreview (ephemeral):\n\`\`\`\n${message}\n\`\`\``,
      ephemeral: true
    });
  }

  // ---------- /invites (bonus utility) ----------
  if (commandName === 'invites') {
    const target = interaction.options.getUser('user') || interaction.user;
    const count = inviteCounts[target.id] || 0;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📨 Invite Count')
      .setDescription(`**${target.tag}** has **${count}** invite(s).`)
      .setFooter({ text: '2 invites = 1 MCFA account' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ---------- /stock (admin) ----------
  if (commandName === 'stock') {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only administrators can use this command.', ephemeral: true });
    }

    await interaction.reply({
      content: `📦 **MCFA Stock:** ${accounts.length} account(s) available.`,
      ephemeral: true
    });
  }
});

// ==================== ERROR HANDLING ====================
client.on('error', console.error);
process.on('unhandledRejection', console.error);

// ==================== LOGIN ====================
client.login(config.token);
