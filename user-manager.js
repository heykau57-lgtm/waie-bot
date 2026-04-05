const fs = require('fs');
const path = require('path');

const userPath = path.join(__dirname, 'database', 'user.json');
const aksesPath = path.join(__dirname, 'database', 'akses.json');

function getUsers() {
    try {
        if (!fs.existsSync(userPath)) {
            const defaultUsers = [
                {
                    username: "admin",
                    key: "waie9",
                    expired: Date.now() + (365 * 10 * 86400000),
                    role: "owner",
                    telegram_id: "8429302432",
                    isLoggedIn: false,
                    created_at: Date.now()
                }
            ];
            fs.writeFileSync(userPath, JSON.stringify(defaultUsers, null, 2));
            return defaultUsers;
        }
        const data = fs.readFileSync(userPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading users:', err);
        return [];
    }
}

function saveUsers(users) {
    try {
        fs.writeFileSync(userPath, JSON.stringify(users, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving users:', err);
        return false;
    }
}

function loadAkses() {
    try {
        if (!fs.existsSync(aksesPath)) {
            const defaultAkses = { owners: [], admins: [] };
            fs.writeFileSync(aksesPath, JSON.stringify(defaultAkses, null, 2));
            return defaultAkses;
        }
        const data = fs.readFileSync(aksesPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error loading akses:', err);
        return { owners: [], admins: [] };
    }
}

function saveAkses(data) {
    try {
        fs.writeFileSync(aksesPath, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error('Error saving akses:', err);
        return false;
    }
}

function isOwner(userId) {
    const akses = loadAkses();
    return akses.owners.includes(userId);
}

function isAuthorized(userId) {
    const akses = loadAkses();
    return akses.owners.includes(userId) || akses.admins.includes(userId);
}

module.exports = {
    getUsers,
    saveUsers,
    loadAkses,
    saveAkses,
    isOwner,
    isAuthorized
};
