const config = require('./config');
const stateManager = require('./stateManager');
const reminderSystem = require('./reminderSystem');
const settingsManager = require('./settingsManager');

let pendingMorningTimer = null;
let pendingNightTimer = null;

function logDebug(message, extra = {}) {
    const ts = new Date().toISOString();
    console.log(`[presence][${ts}] ${message}`, extra);
}

function checkAndSchedule(client, userId, source = 'presence') {
    const now = new Date();
    const hour = now.getHours();
    const settings = settingsManager.getSettings();
    const activeDelay = settings.activeDelayMinutes || config.activeDelayMinutes;

    logDebug('checkAndSchedule called', {
        source,
        userId,
        hour,
        morningStart: config.morningStart,
        nightStart: config.nightStart,
        activeDelayMinutes: activeDelay
    });

    // Check Morning (Start to Night Start)
    if (hour >= config.morningStart && hour < config.nightStart) {
        const morningDone = stateManager.isCompleted(reminderSystem.REMINDER_TYPES.MORNING);
        const morningActive = reminderSystem.isRepeatActive(reminderSystem.REMINDER_TYPES.MORNING);
        const morningExpired = reminderSystem.isReminderExpired(reminderSystem.REMINDER_TYPES.MORNING, now);
        logDebug('Morning window', { morningDone, morningActive, morningExpired, pendingMorningTimer: !!pendingMorningTimer });
        
        if (!morningDone && !morningActive && !morningExpired) {
            if (!pendingMorningTimer) {
                logDebug(`Scheduling Morning reminder in ${activeDelay} mins.`);
                pendingMorningTimer = setTimeout(() => {
                    // Double check in case it started while waiting
                    if (!reminderSystem.isRepeatActive(reminderSystem.REMINDER_TYPES.MORNING)
                        && !reminderSystem.isReminderExpired(reminderSystem.REMINDER_TYPES.MORNING)) {
                        reminderSystem.sendReminder(client, userId, reminderSystem.REMINDER_TYPES.MORNING);
                    }
                    pendingMorningTimer = null;
                }, activeDelay * 60 * 1000);
            }
        }
    } else {
        logDebug('Outside morning window');
    }

    // Check Night (Night Start to Midnight OR Midnight to Morning Start)
    const isLateNight = hour < config.morningStart; 
    const isEvening = hour >= config.nightStart;

    if (isEvening || isLateNight) {
        const nightDone = stateManager.isCompleted(reminderSystem.REMINDER_TYPES.NIGHT);
        const nightActive = reminderSystem.isRepeatActive(reminderSystem.REMINDER_TYPES.NIGHT);
        const nightExpired = reminderSystem.isReminderExpired(reminderSystem.REMINDER_TYPES.NIGHT, now);
        logDebug('Night window', { nightDone, nightActive, nightExpired, pendingNightTimer: !!pendingNightTimer });

        if (!nightDone && !nightActive && !nightExpired) {
            if (!pendingNightTimer) {
                logDebug(`Scheduling Night reminder in ${activeDelay} mins.`);
                pendingNightTimer = setTimeout(() => {
                    if (!reminderSystem.isRepeatActive(reminderSystem.REMINDER_TYPES.NIGHT)
                        && !reminderSystem.isReminderExpired(reminderSystem.REMINDER_TYPES.NIGHT)) {
                        reminderSystem.sendReminder(client, userId, reminderSystem.REMINDER_TYPES.NIGHT);
                    }
                    pendingNightTimer = null;
                }, activeDelay * 60 * 1000);
            }
        }
    } else {
        logDebug('Outside night window');
    }
}

function handlePresenceUpdate(oldPresence, newPresence) {
    const settings = settingsManager.getSettings();
    const targetUserId = settings.targetUserId || config.targetUserId;

    logDebug('presenceUpdate received', {
        targetUserId,
        newUserId: newPresence.userId,
        oldStatus: oldPresence?.status,
        newStatus: newPresence.status
    });

    // Filter by User
    if (newPresence.userId !== targetUserId) {
        logDebug('Ignored: not target user');
        return;
    }

    // Check Status Change
    const wasOffline = !oldPresence || oldPresence.status === 'offline' || oldPresence.status === 'invisible';
    const isOnline = newPresence.status === 'online' || newPresence.status === 'dnd' || newPresence.status === 'idle';

    if (wasOffline && isOnline) {
        logDebug('Transition offline->online detected');
        checkAndSchedule(newPresence.client, newPresence.userId);
    } else {
        logDebug('No offline->online transition', { wasOffline, isOnline });
    }
}

let lastActivityCheck = 0;

function handleUserActivity(client, userId, source = 'unknown') {
    const settings = settingsManager.getSettings();
    const targetUserId = settings.targetUserId || config.targetUserId;

    logDebug('User activity received', { source, userId, targetUserId });

    if (!targetUserId || userId !== targetUserId) {
        logDebug('Ignored activity: not target user or target not set');
        return;
    }

    // Throttle checks to avoid disk spam (1 minute)
    const now = Date.now();
    if (now - lastActivityCheck < 60 * 1000) {
        logDebug('Activity throttled');
        return;
    }
    lastActivityCheck = now;

    checkAndSchedule(client, userId);
}

module.exports = {
    handlePresenceUpdate,
    handleUserActivity,
    checkAndSchedule
};
