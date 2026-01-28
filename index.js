require('dotenv').config();
const { ethers } = require('ethers');
const { Markup, Telegraf } = require('telegraf');
const http = require('http');

// 1. Stay-Alive Server (For Render)
http.createServer((req, res) => {
    res.write('Stallion Premium Bot is Running!');
    res.end();
}).listen(process.env.PORT || 3000);

console.log("--- Stallion Premium System Startup ---");

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const bot = new Telegraf(process.env.BOT_TOKEN);

const exchangeAddress = process.env.CONTRACT_ADDRESS; 
const STALLION_TOKEN_ADDRESS = "0x94Abf62b41f815448eEDBE9eC10f10576D9D6004";

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// 2. Join Welcome Logic (Channel Joiners ke liye)
bot.on('chat_member', async (ctx) => {
    if (ctx.chatMember.new_chat_member.status === 'member') {
        const name = ctx.chatMember.new_chat_member.user.first_name || "Trader";
        const welcomeText = `
🚀 **Welcome to the Stallion Family, ${name}!** 🚀

Aap ab India ke fastest growing exchange community ka hissa hain.

✅ **Live Trade Alerts:** Sab isi channel par milenge.
🌐 **Website:** [stallion.exchange](https://stallion.exchange)
        `;
        try {
            await bot.telegram.sendMessage(process.env.CHANNEL_ID, welcomeText, { parse_mode: 'Markdown' });
            console.log(`👋 Welcome sent for ${name}`);
        } catch (e) { console.error("Welcome Error:", e.message); }
    }
});

// 3. Trade Alert UI
async function handleTrade(type, user, usdt, tokens, txHash) {
    const isBuy = type === 'BUY';
    const title = isBuy ? '🟢 **STALLION BUY!** 🚀' : '🔴 **STALLION SELL!** 📉';

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`$${usdt.toFixed(2)} USDT\`
💎 **Amount:** \`${tokens.toLocaleString(undefined, {minimumFractionDigits: 2})} STN\`
📊 **Type:** ${type} Order

👤 **Trader:** [View Profile](https://polygonscan.com/address/${user})
━━━━━━━━━━━━━━━━━━━━━━
🔗 **Tx:** [View on PolygonScan](https://polygonscan.com/tx/${txHash})
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([[Markup.button.url('🌐 Trade Now', 'https://stallion.exchange')]])
        });
        console.log(`✅ ${type} Alert Sent!`);
    } catch (e) { console.error("❌ Alert Error:", e.message); }
}

// 4. Optimized Polling
async function startPolling() {
    console.log("🔍 Monitoring Polygon Chain...");
    let lastBlock = await provider.getBlockNumber();
    console.log(`Starting from block: ${lastBlock}`);

    setInterval(async () => {
        try {
            const currentBlock = await provider.getBlockNumber();
            if (currentBlock > lastBlock) {
                const boughtLogs = await contract.queryFilter(contract.filters.Bought(), lastBlock + 1, currentBlock);
                boughtLogs.forEach(log => {
                    handleTrade('BUY', log.args[1], parseFloat(ethers.formatUnits(log.args[3], 6)), parseFloat(ethers.formatUnits(log.args[4], 18)), log.transactionHash);
                });

                const soldLogs = await contract.queryFilter(contract.filters.Sold(), lastBlock + 1, currentBlock);
                soldLogs.forEach(log => {
                    handleTrade('SELL', log.args[1], parseFloat(ethers.formatUnits(log.args[4], 6)), parseFloat(ethers.formatUnits(log.args[3], 18)), log.transactionHash);
                });
                lastBlock = currentBlock;
            }
        } catch (e) { console.error("Polling Error:", e.message); }
    }, 15000); 
}

// 5. Bot Connect
async function runBot() {
    try {
        const info = await bot.telegram.getMe();
        console.log(`✅ Bot Identity: @${info.username}`);

        await bot.launch({ dropPendingUpdates: true });
        console.log("🚀 BOT IS NOW FULLY LIVE!");
        
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, "🛡 **Stallion Premium Monitor: Online**\nLive trades and community tracking active.");
        
        startPolling();
    } catch (err) { 
        console.error("❌ Startup Failed:", err.message);
        setTimeout(runBot, 5000); // Auto-retry
    }
}

runBot();