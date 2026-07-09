const fs = require('fs');
const path = require('path');
const config = require('./config');

const DATA_DIR = path.join(__dirname, '../data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getLogicalDateString() {
    // Current time
    const now = new Date();
    // Shift time back by (morningStart) hours. 
    // This makes the "day" start at morningStart.
    const shifted = new Date(now.getTime() - config.morningStart * 60 * 60 * 1000);
    
    // Use local time methods to respect system timezone (JST)
    const y = shifted.getFullYear();
    const m = String(shifted.getMonth() + 1).padStart(2, '0');
    const d = String(shifted.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;
}

function loadState() {
    try {
        if (!fs.existsSync(STATE_FILE)) {
            return resetState();
        }
        const data = fs.readFileSync(STATE_FILE, 'utf8');
        const state = JSON.parse(data);

        // Check if logical date matches, if not reset
        if (state.date !== getLogicalDateString()) {
            return resetState();
        }
        return state;
    } catch (error) {
        console.error('Error loading state:', error);
        return resetState();
    }
}

function saveState(state) {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error saving state:', error);
    }
}

function resetState() {
    const defaultState = {
        date: getLogicalDateString(),
        morning: false,
        night: false,
        lastActivityDate: null
    };
    saveState(defaultState);
    return defaultState;
}

function markCompleted(type) { // type: 'morning' | 'night'
    const state = loadState();
    if (type in state) {
        state[type] = true;
        saveState(state);
        return true;
    }
    return false;
}

function isCompleted(type) {
    const state = loadState();
    return state[type] === true;
}

function markFirstActivityToday() {
    const state = loadState();
    const today = getLogicalDateString();

    if (state.lastActivityDate !== today) {
        state.lastActivityDate = today;
        saveState(state);
        return true;
    }

    return false;
}

module.exports = {
    loadState,
    markCompleted,
    isCompleted,
    markFirstActivityToday
};
