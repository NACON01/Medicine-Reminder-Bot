const fs = require('fs');
const path = require('path');
const config = require('./config'); // Fallback to initial config

const DATA_DIR = path.join(__dirname, '../data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadSettings() {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) {
            return initializeSettings();
        }
        const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading settings:', error);
        return initializeSettings();
    }
}

function initializeSettings() {
    const defaultSettings = {
        targetUserId: config.targetUserId || null,
        targetChannelId: null,
        activeDelayMinutes: config.activeDelayMinutes,
        snoozeDelayMinutes: config.snoozeDelayMinutes,
        retryDelayMinutes: config.retryDelayMinutes
    };
    saveSettings(defaultSettings);
    return defaultSettings;
}

function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('Error saving settings:', error);
    }
}

function updateSettings(newSettings) {
    const current = loadSettings();
    const updated = { ...current, ...newSettings };
    saveSettings(updated);
    return updated;
}

function getSettings() {
    return loadSettings();
}

module.exports = {
    getSettings,
    updateSettings
};
