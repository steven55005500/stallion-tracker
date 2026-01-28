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

// 2. Configuration & RPC Connection
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const bot = new Telegraf(process.env.BOT_TOKEN);

const exchangeAddress = process.env.CONTRACT_ADDRESS; 

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// 3. Premium Welcome Logic
// Note: Iske liye BotFather mein Privacy Mode OFF hona zaroori hai
bot.on('chat_member', async (ctx) => {
    const status = ctx.chatMember.new_chat_member.status;
    // Check if the user is a new member or admin
    if (status === 'member' || status === 'administrator') {
        const name = ctx.chatMember.new_chat_member.user.first_name || "Trader";
        
        // Professional English Welcome Message
        const welcomeText = `🚀 **Welcome to the Stallion Family, ${name}!** 🚀\n\nYou are now part of India's fastest-growing exchange community.\n\n✅ **Live Trade Alerts:** Get real-time updates directly in this channel.\n🌐 **Official Website:** [stallion.exchange](https://stallion.exchange)\n\nStay tuned for the latest market moves! 📈`;
        
        try {
            await ctx.telegram.sendMessage(process.env.CHANNEL_ID, welcomeText, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: false 
            });
            console.log(`👋 English Welcome message sent for: ${name}`);
        } catch (e) { 
            console.error("Welcome Message Error:", e.message); 
        }
    }
});

// 4. Trade Alert UI Handler
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

// 5. High-Performance Polling
async function startPolling() {
    console.log("🔍 Monitoring Polygon Chain...");
    let lastBlock;
    try {
        lastBlock = await provider.getBlockNumber();
        console.log(`Starting from block: ${lastBlock}`);
    } catch (e) {
        console.error("RPC Error:", e.message);
        setTimeout(startPolling, 5000);
        return;
    }

    setInterval(async () => {
        try {
            const currentBlock = await provider.getBlockNumber();
            if (currentBlock > lastBlock) {
                // Fetch Buy Events
                const boughtLogs = await contract.queryFilter(contract.filters.Bought(), lastBlock + 1, currentBlock);
                for (const log of boughtLogs) {
                    await handleTrade('BUY', log.args[1], parseFloat(ethers.formatUnits(log.args[3], 6)), parseFloat(ethers.formatUnits(log.args[4], 18)), log.transactionHash);
                }

                // Fetch Sell Events
                const soldLogs = await contract.queryFilter(contract.filters.Sold(), lastBlock + 1, currentBlock);
                for (const log of soldLogs) {
                    await handleTrade('SELL', log.args[1], parseFloat(ethers.formatUnits(log.args[4], 6)), parseFloat(ethers.formatUnits(log.args[3], 18)), log.transactionHash);
                }
                lastBlock = currentBlock;
            }
        } catch (e) { console.error("Polling Loop Error:", e.message); }
    }, 15000); 
}

// 6. Launch Sequence
async function runBot() {
    try {
        const info = await bot.telegram.getMe();
        console.log(`✅ Bot Identity: @${info.username}`);

        // dropPendingUpdates: true purane stuck connections clear karega
        await bot.launch({ 
            dropPendingUpdates: true,
            allowedUpdates: ['chat_member', 'message', 'channel_post'] 
        });
        
        console.log("🚀 BOT IS NOW FULLY LIVE!");
        
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, "🛡 **Stallion Premium Monitor: Online**\nLive trades and community tracking active.");
        
        startPolling();
    } catch (err) { 
        console.error("❌ Startup Failed:", err.message);
        // Agar conflict (409) hai, toh ye 10 second baad retry karega
        setTimeout(runBot, 10000); 
    }
}

runBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));