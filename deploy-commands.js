const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');

let config = {};
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  config = require('./config.json');
}

config.token = process.env.DISCORD_TOKEN || process.env.TOKEN || config.token;
config.clientId = process.env.CLIENT_ID || config.clientId;
config.guildId = process.env.GUILD_ID || config.guildId;

if (!config.token || !config.clientId) {
  console.error('❌ Missing DISCORD_TOKEN or CLIENT_ID (set via env or config.json)');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim 1 MCFA account (costs 2 invites)'),

  new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Set the channel where users can claim rewards (Admin only)')
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('The text channel for claiming')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('mcfa')
    .setDescription('Add an MCFA account to the stock (Admin only)')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('The full account message (e.g. Email: xxx | Pass: yyy | Note: ...)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check how many invites you (or someone else) has')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('User to check (optional)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Check how many MCFA accounts are left in stock (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log('🔄 Deploying slash commands...');

    // Deploy to specific guild (instant) — recommended for development
    if (config.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
      );
      console.log('✅ Successfully deployed guild commands.');
    } else {
      // Global deploy (can take up to 1 hour)
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: commands }
      );
      console.log('✅ Successfully deployed global commands.');
    }
  } catch (error) {
    console.error(error);
  }
})();
