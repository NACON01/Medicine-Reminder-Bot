const { Client, GatewayIntentBits, REST, Routes, Partials } = require('discord.js');
process.env.TZ = 'Asia/Tokyo';
const express = require('express');
const config = require('./src/config');
const presenceListener = require('./src/presenceListener');
const reminderSystem = require('./src/reminderSystem');
const settingsManager = require('./src/settingsManager');
const { settingsCommand, pingCommand, handleSettingsCommand, handlePingCommand } = require('./src/commands');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

const app = express();
app.use(express.json());

app.post('/webhook/wakeup', (req, res) => {
    const auth = req.header('Authorization') || '';
    const expected = config.webhookToken ? `Bearer ${config.webhookToken}` : null;

    if (expected && auth !== expected) {
        return res.status(401).json({ ok: false });
    }

    const userId = req.body?.userId || config.targetUserId;
    if (!userId) {
        return res.status(400).json({ ok: false, error: 'missing_userId' });
    }

    presenceListener.handleUserActivity(client, userId, 'webhook');
    return res.json({ ok: true });
});

app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
});

app.listen(config.webhookPort, () => {
    console.log(`Webhook server listening on port ${config.webhookPort}`);
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Morning Window Start: ${config.morningStart}:00, Night Window Start: ${config.nightStart}:00`);

    // Register Slash Commands
    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: [settingsCommand.toJSON(), pingCommand.toJSON()] },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error refreshing commands:', error);
    }

    const runReminderHealthCheck = () => {
        const settings = settingsManager.getSettings();
        const targetUserId = settings.targetUserId || config.targetUserId;
        if (!targetUserId) {
            console.error('Reminder health check skipped: target user is not configured.');
            return;
        }
        presenceListener.checkAndSchedule(client, targetUserId, 'healthCheck');
    };

    runReminderHealthCheck();
    setInterval(runReminderHealthCheck, 60 * 1000);
});

client.on('presenceUpdate', (oldPresence, newPresence) => {
    presenceListener.handlePresenceUpdate(oldPresence, newPresence);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.user && !interaction.user.bot) {
        presenceListener.handleUserActivity(interaction.client, interaction.user.id, 'interactionCreate');
    }
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'settings') {
            await handleSettingsCommand(interaction);
        } else if (interaction.commandName === 'ping') {
            await handlePingCommand(interaction);
        }
    } else if (interaction.isButton()) {
        await reminderSystem.handleInteraction(interaction);
    }
});

client.on('messageCreate', (message) => {
    if (message.author && !message.author.bot) {
        presenceListener.handleUserActivity(message.client, message.author.id, 'messageCreate');
    }
});

client.on('messageReactionAdd', (reaction, user) => {
    if (user && !user.bot) {
        presenceListener.handleUserActivity(reaction.client, user.id, 'messageReactionAdd');
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (newState.member && !newState.member.user.bot) {
        presenceListener.handleUserActivity(newState.client, newState.id, 'voiceStateUpdate');
    }
});

// Error handling to prevent crash
client.on('error', console.error);

client.login(config.token);
