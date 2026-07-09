const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const settingsManager = require('./settingsManager');

const settingsCommand = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Botの設定を変更します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(option =>
        option.setName('user')
            .setDescription('リマインドを送る対象ユーザー'))
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('リマインドを送るチャンネル'))
    .addNumberOption(option =>
        option.setName('active_delay')
            .setDescription('オンライン検知後の待機時間（分）')
            .setMinValue(0.1))
    .addNumberOption(option =>
        option.setName('snooze_delay')
            .setDescription('「いいえ」選択後の再通知時間（分）')
            .setMinValue(0.1))
    .addNumberOption(option =>
        option.setName('retry_delay')
            .setDescription('反応がない場合の再送信間隔（分）')
            .setMinValue(0.1));

const pingCommand = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Botの生存確認を行います');

async function handleSettingsCommand(interaction) {
    const user = interaction.options.getUser('user');
    const channel = interaction.options.getChannel('channel');
    const activeDelay = interaction.options.getNumber('active_delay');
    const snoozeDelay = interaction.options.getNumber('snooze_delay');
    const retryDelay = interaction.options.getNumber('retry_delay');

    const updates = {};
    const messages = [];

    if (user) {
        updates.targetUserId = user.id;
        messages.push(`対象ユーザー: <@${user.id}>`);
    }
    if (channel) {
        updates.targetChannelId = channel.id;
        messages.push(`通知チャンネル: <#${channel.id}>`);
    }
    if (activeDelay !== null) {
        updates.activeDelayMinutes = activeDelay;
        messages.push(`活動後猶予: ${activeDelay}分`);
    }
    if (snoozeDelay !== null) {
        updates.snoozeDelayMinutes = snoozeDelay;
        messages.push(`スヌーズ時間: ${snoozeDelay}分`);
    }
    if (retryDelay !== null) {
        updates.retryDelayMinutes = retryDelay;
        messages.push(`再試行間隔: ${retryDelay}分`);
    }

    if (Object.keys(updates).length === 0) {
        const current = settingsManager.getSettings();
        return interaction.reply({
            content: `現在の設定:\n` +
                `ユーザー: ${current.targetUserId ? `<@${current.targetUserId}>` : '未設定'}\n` +
                `チャンネル: ${current.targetChannelId ? `<#${current.targetChannelId}>` : '未設定'}\n` +
                `活動後猶予: ${current.activeDelayMinutes}分\n` +
                `スヌーズ時間: ${current.snoozeDelayMinutes}分\n` +
                `再試行間隔: ${current.retryDelayMinutes || 5}分`,
            ephemeral: true
        });
    }

    settingsManager.updateSettings(updates);

    await interaction.reply({
        content: `設定を更新しました:\n${messages.join('\n')}`,
        ephemeral: true
    });
}

async function handlePingCommand(interaction) {
    await interaction.reply({ content: '🏓 Pong! Botは正常に稼働中です。', ephemeral: true });
}

module.exports = {
    settingsCommand,
    pingCommand,
    handleSettingsCommand,
    handlePingCommand
};
