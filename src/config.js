require('dotenv').config();

module.exports = {
    token: process.env.DISCORD_TOKEN,
    targetUserId: process.env.TARGET_USER_ID,
    webhookToken: process.env.WEBHOOK_TOKEN,
    webhookPort: parseInt(process.env.WEBHOOK_PORT || '3000'),
    morningStart: parseInt(process.env.MORNING_START || '5'),
    nightStart: parseInt(process.env.NIGHT_START || '19'),
    reminderText: process.env.REMINDER_TEXT || 'お薬飲みましたか？',
    activeDelayMinutes: parseFloat(process.env.ACTIVE_DELAY_MINUTES || '10'),
    snoozeDelayMinutes: parseFloat(process.env.SNOOZE_DELAY_MINUTES || '30'),
    retryDelayMinutes: parseFloat(process.env.RETRY_DELAY_MINUTES || '1'),
    mentionRearmCooldownMinutes: parseFloat(process.env.MENTION_REARM_COOLDOWN_MINUTES || '60'),
};
