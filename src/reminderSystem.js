const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const config = require('./config');
const settingsManager = require('./settingsManager');
const stateManager = require('./stateManager');

const REMINDER_TYPES = {
    MORNING: 'morning',
    NIGHT: 'night'
};

const repeatTimers = {
    morning: null,
    night: null
};

// Track last sent timestamps to prevent accidental double-sends within a few seconds
const lastSentTimestamps = {
    morning: 0,
    night: 0
};

function clearRepeatTimer(type) {
    if (repeatTimers[type]) {
        clearTimeout(repeatTimers[type]);
        repeatTimers[type] = null;
    }
}

function isRepeatActive(type) {
    return !!repeatTimers[type];
}

function getStopDeadline(type, now = new Date()) {
    const deadline = new Date(now);
    if (type === REMINDER_TYPES.MORNING) {
        deadline.setHours(config.nightStart, 0, 0, 0);
        return deadline;
    }
    if (type === REMINDER_TYPES.NIGHT) {
        deadline.setHours(23, 59, 0, 0);
        return deadline;
    }
    return null;
}

function minutesSinceMidnight(now = new Date()) {
    return now.getHours() * 60 + now.getMinutes();
}

function isWithinReminderWindow(type, now = new Date()) {
    const minute = minutesSinceMidnight(now);
    const morningStartMinute = config.morningStart * 60;
    const nightStartMinute = config.nightStart * 60;
    const nightStopMinute = 23 * 60 + 59;

    if (type === REMINDER_TYPES.MORNING) {
        return minute >= morningStartMinute && minute < nightStartMinute;
    }
    if (type === REMINDER_TYPES.NIGHT) {
        return minute >= nightStartMinute && minute < nightStopMinute;
    }
    return false;
}

function isReminderExpired(type, now = new Date()) {
    return !isWithinReminderWindow(type, now);
}

/**
 * Deletes the previously sent, unacknowledged reminder message for this type
 * so that mention notifications never pile up beyond one at a time.
 */
async function deletePreviousReminderMessage(client, type) {
    const { channelId, messageId } = stateManager.getLastMessage(type);
    if (!channelId || !messageId) return;
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) return;
        const message = await channel.messages.fetch(messageId);
        await message.delete();
    } catch (e) {
        // Already deleted / channel gone / no permission - safe to ignore.
    }
}

function scheduleRepeatIfNeeded(client, userId, type) {
    if (stateManager.isCompleted(type)) return;
    if (isReminderExpired(type)) {
        clearRepeatTimer(type);
        console.log(`Stopping ${type} reminder: stop deadline reached.`);
        return;
    }
    if (repeatTimers[type]) return;

    const settings = settingsManager.getSettings();
    const retryDelay = settings.retryDelayMinutes || config.retryDelayMinutes || 5;

    // Safety: ensure at least 1 minute if retryDelay is somehow 0 or less
    const delayMs = Math.max(retryDelay, 1) * 60 * 1000;

    repeatTimers[type] = setTimeout(async () => {
        repeatTimers[type] = null;
        if (stateManager.isCompleted(type)) return;
        if (isReminderExpired(type)) {
            console.log(`Stopping ${type} reminder repeat: stop deadline reached.`);
            return;
        }
        await sendReminder(client, userId, type);
    }, delayMs);
}

/**
 * Sends the medication reminder to the user in the configured channel.
 * @param {Client} client 
 * @param {string} userId
 * @param {string} type 'morning' or 'night'
 */
async function sendReminder(client, userId, type) {
    try {
        if (isReminderExpired(type)) {
            clearRepeatTimer(type);
            console.log(`Skipping ${type} reminder: stop deadline reached.`);
            return;
        }

        // Double-check state before sending
        if (stateManager.isCompleted(type)) {
            console.log(`Skipping ${type} reminder: already completed.`);
            return;
        }

        // Flood control: prevent sending same type within 10 seconds
        const now = Date.now();
        if (now - lastSentTimestamps[type] < 10000) {
            console.log(`Skipping ${type} reminder: too frequent.`);
            scheduleRepeatIfNeeded(client, userId, type); // Ensure timer keeps going even if we throttled this send
            return;
        }
        lastSentTimestamps[type] = now;

        const settings = settingsManager.getSettings();
        const targetUserId = settings.targetUserId || userId;
        const targetChannelId = settings.targetChannelId;
        
        if (!targetUserId) {
            console.error('No target user configured.');
            return;
        }

        let channel;
        if (targetChannelId) {
            try {
                channel = await client.channels.fetch(targetChannelId);
            } catch (e) {
                console.error(`Could not fetch channel ${targetChannelId}:`, e);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(`${type === REMINDER_TYPES.MORNING ? '🌅 朝' : '🌙 夜'}のお薬リマインダー`)
            .setDescription(config.reminderText);

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`meds_yes_${type}`)
                    .setLabel('飲みました！')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`meds_no_${type}`)
                    .setLabel('まだ')
                    .setStyle(ButtonStyle.Secondary),
            );

        const messageContent = `<@${targetUserId}>`;
        const withMention = stateManager.needsMention(type);

        await deletePreviousReminderMessage(client, type);

        let sentMessage = null;
        if (channel) {
            const payload = withMention
                ? { content: messageContent, embeds: [embed], components: [row] }
                : { embeds: [embed], components: [row] };
            sentMessage = await channel.send(payload);
            if (withMention) {
                stateManager.markMentionSent(type);
            }
            console.log(`Sent ${type} reminder to channel ${channel.name} for user ${targetUserId}`);
        } else {
            console.log('Target channel not set or invalid, falling back to DM.');
            const user = await client.users.fetch(targetUserId);
            if (user) {
                sentMessage = await user.send({ embeds: [embed], components: [row] });
            }
        }

        if (sentMessage) {
            stateManager.setLastMessage(type, sentMessage.channelId, sentMessage.id);
            scheduleRepeatIfNeeded(client, targetUserId, type);
        }

    } catch (error) {
        console.error('Error sending reminder:', error);
        if (!stateManager.isCompleted(type) && !isReminderExpired(type)) {
            scheduleRepeatIfNeeded(client, userId, type);
        }
    }
}

function rearmMentionOnActivity() {
    for (const type of [REMINDER_TYPES.MORNING, REMINDER_TYPES.NIGHT]) {
        if (stateManager.isCompleted(type)) continue;
        if (!isWithinReminderWindow(type)) continue;

        const settings = settingsManager.getSettings();
        const cooldown = settings.mentionRearmCooldownMinutes || config.mentionRearmCooldownMinutes || 60;
        const last = stateManager.getLastMentionAt(type);
        if (last && Date.now() - last >= cooldown * 60 * 1000) {
            stateManager.setNeedsMention(type, true);
            console.log(`Re-armed ${type} mention after user activity.`);
        }
    }
}

/**
 * Handles interactions (button clicks).
 * @param {Interaction} interaction 
 */
async function handleInteraction(interaction) {
    if (!interaction.isButton()) return;

    const { customId } = interaction;
    if (!customId.startsWith('meds_')) return;

    const settings = settingsManager.getSettings();
    if (settings.targetUserId && interaction.user.id !== settings.targetUserId) {
        return interaction.reply({ content: 'これはあなたへのリマインダーではありません。', ephemeral: true });
    }

    const [_, action, type] = customId.split('_'); 

    if (action === 'yes') {
        stateManager.markCompleted(type);
        clearRepeatTimer(type);
        await interaction.update({
            content: `偉いです！今日も一日頑張りましょう！ (または おやすみなさい！)`,
            components: [], 
            embeds: []      
        });
    } else if (action === 'no') {
        clearRepeatTimer(type);
        stateManager.setNeedsMention(type, true);
        
        const snoozeMinutes = settings.snoozeDelayMinutes || config.snoozeDelayMinutes || 60;

        await interaction.update({
            content: `了解です。${snoozeMinutes}分後にまたお知らせします。`,
            components: [],
            embeds: []
        });

        // Use repeatTimers so presenceListener knows we are active/waiting
        repeatTimers[type] = setTimeout(async () => {
            repeatTimers[type] = null;
            if (isReminderExpired(type)) {
                console.log(`Stopping ${type} snooze: stop deadline reached.`);
                return;
            }
            await sendReminder(interaction.client, interaction.user.id, type);
        }, snoozeMinutes * 60 * 1000);
    }
}

module.exports = {
    sendReminder,
    handleInteraction,
    REMINDER_TYPES,
    isRepeatActive,
    isReminderExpired,
    isWithinReminderWindow,
    rearmMentionOnActivity
};
