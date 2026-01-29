require('dotenv').config();
const { ethers } = require('ethers');
const { Markup, Telegraf } = require('telegraf');
const http = require('http');

// 1. Stay-Alive Server
http.createServer((req, res) => {
    res.write('Stallion Premium Bot is Running!');
    res.end();
}).listen(process.env.PORT || 3000);

console.log("--- Stallion Premium System Startup ---");

// 2. Configuration
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const bot = new Telegraf(process.env.BOT_TOKEN);
const exchangeAddress = process.env.CONTRACT_ADDRESS; 

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// 3. Welcome Message Logic (Naye member ke join hote hi)
bot.on('new_chat_members', async (ctx) => {
    try {
        const newMembers = ctx.message.new_chat_members;
        for (const member of newMembers) {
            const name = member.first_name || "Trader";
            const welcomeText = `🚀 **Welcome to Stallion Family, ${name}!** 🚀\n\nIndia's most transparent self-growing token economy.\n\n✅ **Live Trade Alerts:** Enabled\n🌐 [stallion.exchange](https://stallion.exchange)\n\nStay tuned for real-time market updates! 📈`;

            await ctx.replyWithMarkdown(welcomeText, {
                disable_web_page_preview: false
            });
            console.log(`👋 Welcome message sent for: ${name}`);
        }
    } catch (e) {
        console.error("Welcome Message Error:", e.message);
    }
});

// 4. Advanced Trade Alert Handler
async function handleTrade(type, user, usdt, tokens, txHash) {
    const isBuy = type === 'BUY';
    const icon = isBuy ? '🟢' : '🔴';
    const whaleIcon = usdt >= 500 ? '🐋🐳 ' : ''; // $500+ trades
    
    // Price Calculation
    const price = (usdt / tokens).toFixed(6);
    const shortAddr = `${user.substring(0, 6)}...${user.substring(user.length - 4)}`;

    const title = `${whaleIcon}${icon} **STALLION ${type}** ${icon}`;
    
    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`$${usdt.toFixed(2)} USDT\`
💎 **Amount:** \`${tokens.toLocaleString()} STN\`
💵 **Price:** \`$${price} per STN\`

👤 **Trader:** [${shortAddr}](https://polygonscan.com/address/${user})
━━━━━━━━━━━━━━━━━━━━━━
🔗 [View on PolygonScan](https://polygonscan.com/tx/${txHash})
━━━━━━━━━━━━━━━━━━━━━━
📊 **Powered by Stallion Exchange**
    `;

    // Premium Buttons
    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.url('🌐 Trade Now', 'https://stallion.exchange'),
            Markup.button.url('📈 Live Chart', `https://dexscreener.com/polygon/${exchangeAddress}`)
        ],
        [
            Markup.button.url('💬 Join Group', 'https://t.me/your_group_link'), // Replace with your link
            Markup.button.url('🐦 Twitter', 'https://twitter.com/stallion_ex')
        ]
    ]);

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...keyboard
        });
        console.log(`✅ ${whaleIcon}${type} Alert Sent!`);
    } catch (e) { console.error("❌ Alert Error:", e.message); }
}

// 5. High-Performance Polling
async function startPolling() {
    console.log("🔍 Monitoring Stallion Protocol...");
    let lastBlock;
    try {
        lastBlock = await provider.getBlockNumber();
    } catch (e) {
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
                    const usdt = parseFloat(ethers.formatUnits(log.args[3], 6));
                    const stn = parseFloat(ethers.formatUnits(log.args[4], 18));
                    await handleTrade('BUY', log.args[1], usdt, stn, log.transactionHash);
                }

                // Fetch Sell Events
                const soldLogs = await contract.queryFilter(contract.filters.Sold(), lastBlock + 1, currentBlock);
                for (const log of soldLogs) {
                    const stn = parseFloat(ethers.formatUnits(log.args[3], 18));
                    const usdt = parseFloat(ethers.formatUnits(log.args[4], 6));
                    await handleTrade('SELL', log.args[1], usdt, stn, log.transactionHash);
                }
                lastBlock = currentBlock;
            }
        } catch (e) { console.error("Loop Error:", e.message); }
    }, 15000); 
}

// 6. Launch Sequence
async function runBot() {
    try {
        await bot.launch({ dropPendingUpdates: true });
        console.log("🚀 STALLION PREMIUM IS LIVE!");
        startPolling();
    } catch (err) {
        console.error("Startup Error:", err.message);
        setTimeout(runBot, 10000); 
    }
}

runBot();

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));