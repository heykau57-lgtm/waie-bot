const express = require('express');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Import modules
const { getUsers, saveUsers, loadAkses, saveAkses, isOwner, isAuthorized } = require('../user-manager.js');
const { activeSessions, savePersistentSessions, cleanupExpiredSessions, generateSessionId } = require('../session-store.js');
const { requireAuth } = require('../auth.middleware.js');

// ==================== AUTH ROUTES ====================

app.get("/", (req, res) => {
    const username = req.cookies.sessionUser;
    const clientSessionId = req.cookies.sessionId;
    
    const activeSession = activeSessions.get(username);
    const isSessionValid = activeSession && activeSession.sessionId === clientSessionId;
    
    if (username && isSessionValid) {
        const users = getUsers();
        const currentUser = users.find(u => u.username === username);
        if (currentUser && Date.now() < currentUser.expired) {
            return res.redirect("/dashboard.html");
        }
    }
    
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get("/login", (req, res) => {
    const username = req.cookies.sessionUser;
    const clientSessionId = req.cookies.sessionId;
    
    const activeSession = activeSessions.get(username);
    const isSessionValid = activeSession && activeSession.sessionId === clientSessionId;
    
    if (username && isSessionValid) {
        const users = getUsers();
        const currentUser = users.find(u => u.username === username);
        if (currentUser && Date.now() < currentUser.expired) {
            return res.redirect("/dashboard.html");
        }
    }
    
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.post("/auth", (req, res) => {
    const { username, key, remember } = req.body;
    const users = getUsers();

    const user = users.find(u => u.username === username && u.key === key);
    if (!user) {
        return res.redirect("/login?msg=" + encodeURIComponent("Username atau Key salah!"));
    }

    if (Date.now() > user.expired) {
        return res.redirect("/login?msg=" + encodeURIComponent("Akun telah expired!"));
    }

    if (activeSessions.has(username)) {
        return res.redirect("/login?msg=" + encodeURIComponent("Akun sudah login di device lain!"));
    }

    const sessionId = generateSessionId();
    
    const SESSION_DURATION = remember === 'true' ? 
        30 * 24 * 60 * 60 * 1000 : 
        24 * 60 * 60 * 1000;
    
    const sessionData = {
        sessionId: sessionId,
        loginTime: Date.now(),
        userAgent: req.headers['user-agent'],
        expiresAt: Date.now() + SESSION_DURATION,
        remember: remember === 'true',
        userData: {
            username: user.username,
            role: user.role,
            expired: user.expired
        }
    };
    
    activeSessions.set(username, sessionData);
    savePersistentSessions();
    
    const cookieOptions = {
        maxAge: SESSION_DURATION,
        httpOnly: true,
        path: "/"
    };
    
    res.cookie("sessionUser", username, cookieOptions);
    res.cookie("sessionId", sessionId, cookieOptions);
    
    res.redirect("/dashboard.html");
});

app.get("/api/session-check", (req, res) => {
    const username = req.cookies.sessionUser;
    const clientSessionId = req.cookies.sessionId;
    
    if (!username || !clientSessionId) {
        return res.status(401).json({ error: "No session" });
    }
    
    const activeSession = activeSessions.get(username);
    if (!activeSession || activeSession.sessionId !== clientSessionId) {
        return res.status(403).json({ error: "Invalid session" });
    }
    
    res.json({ valid: true, username: username });
});

app.get("/api/option-data", requireAuth, (req, res) => {
    try {
        const username = req.cookies.sessionUser;
        const users = getUsers();
        const currentUser = users.find(u => u.username === username);

        if (!currentUser) {
            return res.status(404).json({ error: "User not found" });
        }
        
        const now = Date.now();
        
        let expiredStr;
        if (currentUser.expired === 'Permanent' || currentUser.expired > now + (365 * 10 * 86400000)) {
            expiredStr = 'Permanent';
        } else {
            expiredStr = new Date(currentUser.expired).toLocaleString("id-ID", {
                timeZone: "Asia/Jakarta",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
            });
        }
        
        const timeRemaining = currentUser.expired - now;
        const daysRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60 * 24)));
        
        res.json({
            username: currentUser.username,
            role: currentUser.role || 'user',
            activeSenders: 0,
            totalSenders: 0,
            expired: expiredStr,
            daysRemaining: daysRemaining,
            isPermanent: currentUser.expired === 'Permanent' || currentUser.expired > now + (365 * 10 * 86400000),
            onlineUsers: activeSessions.size || 1,
            sessionValid: true,
            timestamp: now,
            accountStatus: timeRemaining > 0 ? 'active' : 'expired'
        });
        
    } catch (error) {
        console.error('[API] Error:', error);
        res.status(500).json({ error: "Internal server error" });
    }
});

app.get("/api/profile-data", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const users = getUsers();
    const currentUser = users.find(u => u.username === username);

    if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
    }

    const expired = new Date(currentUser.expired).toLocaleString("id-ID", {
        timeZone: "Asia/Jakarta",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

    const now = Date.now();
    const timeRemaining = currentUser.expired - now;
    const daysRemaining = Math.max(0, Math.floor(timeRemaining / (1000 * 60 * 60 * 24)));

    res.json({
        username: currentUser.username,
        role: currentUser.role || 'user',
        key: currentUser.key || '',
        activeSenders: 0,
        expired: expired,
        daysRemaining: daysRemaining,
        createdAt: currentUser.createdAt || Date.now(),
        telegram_id: currentUser.telegram_id || "",
        status: Date.now() > currentUser.expired ? 'expired' : 'active'
    });
});

app.get("/api/online-users", requireAuth, (req, res) => {
    const onlineCount = activeSessions.size;
    res.json({ 
        onlineUsers: onlineCount || 1,
        timestamp: Date.now()
    });
});

app.get("/api/users", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const users = getUsers();
    
    const currentUser = users.find(u => u.username === username);
    
    if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
    }
    
    let filteredUsers = [];
    
    if (currentUser.role === 'owner') {
        filteredUsers = users;
    } else if (currentUser.role === 'admin') {
        filteredUsers = users.filter(u => u.role === 'user');
    } else {
        return res.status(403).json({ error: "Forbidden" });
    }
    
    const responseUsers = filteredUsers.map(user => ({
        username: user.username,
        role: user.role,
        key: currentUser.role === 'owner' ? user.key : '********',
        expired: user.expired,
        status: Date.now() > user.expired ? 'Expired' : 'Active'
    }));
    
    res.json({ 
        success: true,
        users: responseUsers 
    });
});

app.get("/api/user/:username", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const targetUsername = req.params.username;
    const users = getUsers();
    
    const currentUser = users.find(u => u.username === username);
    const targetUser = users.find(u => u.username === targetUsername);
    
    if (!currentUser || !targetUser) {
        return res.json({ success: false, error: "User not found" });
    }
    
    if (currentUser.role === 'admin') {
        if (targetUser.role !== 'user') {
            return res.json({ success: false, error: "Forbidden" });
        }
    }
    
    res.json({
        success: true,
        user: {
            username: targetUser.username,
            role: targetUser.role,
            key: currentUser.role === 'owner' ? targetUser.key : '********',
            expired: targetUser.expired
        }
    });
});

app.post("/api/user", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const { username: newUsername, role, key, duration } = req.body;
    
    const users = getUsers();
    
    const currentUser = users.find(u => u.username === username);
    
    if (!currentUser) {
        return res.json({ success: false, error: "User not found" });
    }
    
    if (currentUser.role === 'admin' && role !== 'user') {
        return res.json({ success: false, error: "Admin can only create users" });
    }
    
    if (!['owner', 'admin', 'user'].includes(role)) {
        return res.json({ success: false, error: "Invalid role" });
    }
    
    if (users.find(u => u.username === newUsername)) {
        return res.json({ success: false, error: "Username already exists" });
    }
    
    let expired;
    if (duration === 'permanent') {
        expired = Date.now() + (365 * 10 * 86400000);
    } else {
        const durationMs = parseDuration(duration);
        if (!durationMs) {
            return res.json({ success: false, error: "Invalid duration" });
        }
        expired = Date.now() + durationMs;
    }
    
    let userKey;
    if (key && key.trim() !== '') {
        userKey = key.trim();
        
        if (userKey.length < 4) {
            return res.json({ success: false, error: "Key minimal 4 karakter" });
        }
        
        if (users.find(u => u.key === userKey)) {
            return res.json({ success: false, error: "Key sudah digunakan, coba key lain" });
        }
    } else {
        userKey = generateKey(6);
    }
    
    const newUser = {
        username: newUsername,
        key: userKey,
        expired: expired,
        role: role,
        telegram_id: "",
        isLoggedIn: false,
        createdBy: username,
        createdAt: Date.now()
    };
    
    users.push(newUser);
    saveUsers(users);
    
    res.json({
        success: true,
        message: "User created successfully",
        user: {
            username: newUser.username,
            role: newUser.role,
            key: newUser.key,
            expired: newUser.expired
        }
    });
});

app.put("/api/user/:username", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const targetUsername = req.params.username;
    const { role, key, duration } = req.body;
    const users = getUsers();
    
    const currentUser = users.find(u => u.username === username);
    const targetUserIndex = users.findIndex(u => u.username === targetUsername);
    
    if (!currentUser || targetUserIndex === -1) {
        return res.json({ success: false, error: "User not found" });
    }
    
    const targetUser = users[targetUserIndex];
    
    if (targetUser.role === 'owner') {
        return res.json({ success: false, error: "Cannot edit user with owner role" });
    }
    
    if (currentUser.role === 'admin') {
        if (targetUser.role !== 'user') {
            return res.json({ success: false, error: "Forbidden" });
        }
        
        if (role && role !== 'user') {
            return res.json({ success: false, error: "Admin can only set role to 'user'" });
        }
    }
    
    if (role && ['owner', 'admin', 'user'].includes(role)) {
        if (role === 'owner') {
            return res.json({ success: false, error: "Cannot set role to owner via web interface" });
        }
        users[targetUserIndex].role = role;
    }
    
    if (key && key.trim() !== '' && key.trim() !== targetUser.key) {
        const newKey = key.trim();
        
        if (newKey.length < 4) {
            return res.json({ success: false, error: "Key minimal 4 karakter" });
        }

        if (users.find(u => u.key === newKey && u.username !== targetUsername)) {
            return res.json({ success: false, error: "Key sudah digunakan, coba key lain" });
        }
        
        users[targetUserIndex].key = newKey;
    }

    if (duration) {
        if (duration === 'permanent') {
            users[targetUserIndex].expired = Date.now() + (365 * 10 * 86400000);
        } else {
            const durationMs = parseDuration(duration);
            if (durationMs) {
                users[targetUserIndex].expired = Date.now() + durationMs;
            }
        }
    }
    
    saveUsers(users);
    
    res.json({
        success: true,
        message: "User updated successfully"
    });
});

app.delete("/api/user/:username", requireAuth, (req, res) => {
    const username = req.cookies.sessionUser;
    const targetUsername = req.params.username;
    const users = getUsers();
    
    const currentUser = users.find(u => u.username === username);
    const targetUser = users.find(u => u.username === targetUsername);
    
    if (!currentUser || !targetUser) {
        return res.json({ success: false, error: "User not found" });
    }
    
    if (targetUser.role === 'owner') {
        return res.json({ success: false, error: "Cannot delete user with owner role via web" });
    }
    
    if (currentUser.role === 'admin') {
        if (targetUser.role !== 'user') {
            return res.json({ success: false, error: "Forbidden" });
        }
    }
    
    const updatedUsers = users.filter(u => u.username !== targetUsername);
    saveUsers(updatedUsers);
    
    res.json({
        success: true,
        message: "User deleted successfully"
    });
});

app.get("/api/my-senders", requireAuth, (req, res) => {
    res.json({ success: true, senders: [], total: 0 });
});

app.post("/api/add-sender", requireAuth, async (req, res) => {
    res.json({ success: true, message: "Feature coming soon" });
});

app.post("/api/delete-sender", requireAuth, async (req, res) => {
    res.json({ success: true, message: "Feature coming soon" });
});

app.get("/api/events", requireAuth, (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    res.write(': heartbeat\n\n');
});

app.post("/api/logout-other-device", async (req, res) => {
    res.json({ success: true, message: "Logged out" });
});

app.get("/logout", (req, res) => {
    const username = req.cookies.sessionUser;
    
    if (username) {
        activeSessions.delete(username);
        savePersistentSessions();
    }
    
    res.clearCookie("sessionUser", { path: "/", expires: new Date(0) });
    res.clearCookie("sessionId", { path: "/", expires: new Date(0) });
    
    res.redirect("/login?msg=Logout berhasil");
});

function parseDuration(str) {
    const match = str.match(/^(\d+)([dh])$/);
    if (!match) return null;
    const value = parseInt(match[1]);
    const unit = match[2];
    return unit === "d" ? value * 86400000 : value * 3600000;
}

function generateKey(length = 4) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Waie Bot running on port ${PORT}`);
});

module.exports = app;
