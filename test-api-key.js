const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

const jar = new CookieJar();
const client = wrapper(axios.create({ jar, withCredentials: true }));

async function run() {
    try {
        // 1. Trigger Google Auth mock to create session
        console.log("Mocking login...");
        const db = require('./src/services/db.js').default;
        db.prepare("INSERT OR IGNORE INTO users (id, email) VALUES ('mock_user', 'mock@test.com')").run();
        
        // Actually we can't easily mock OAuth via network, let's just create a quick test endpoint
    } catch(e) {
        console.error(e);
    }
}
run();
