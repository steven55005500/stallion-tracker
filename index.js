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

// 3. Welcome Message Logic
bot.on(['new_chat_members', 'chat_member'], async (ctx) => {
    try {
        const member = ctx.message?.new_chat_members?.[0] || ctx.chatMember?.new_chat_member?.user;
        if (member && !member.is_bot) {
            const name = member.first_name || "Trader";
            const welcomeText = `🚀 **Welcome to Stallion Family, ${name}!** 🚀\n\nWorld's most transparent self-growing token economy.\n\n✅ **Live Trade Alerts Active**\n🌐 [stallion.exchange](https://stallion.exchange)\n\nStay tuned for real-time market updates! 📈`;
            await ctx.replyWithMarkdown(welcomeText, { disable_web_page_preview: false });
        }
    } catch (e) { console.error("Welcome Error:", e.message); }
});

// 4. Advanced Trade Alert Handler
async function handleTrade(type, user, usdt, tokens, txHash, isHistory = false) {
    const isBuy = type === 'BUY';
    const icon = isBuy ? '🟢' : '🔴';
    const whaleIcon = usdt >= 500 ? '🐋🐳 ' : ''; 
    const price = (usdt / tokens).toFixed(6);
    const shortAddr = `${user.substring(0, 6)}...${user.substring(user.length - 4)}`;
    
    // History alerts ke liye alag tag
    const historyTag = isHistory ? "🕒 **[PAST TRADE]**\n" : "";

    const title = `${historyTag}${whaleIcon}${icon} **STALLION ${type}** ${icon}`;
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

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.url('🌐 Trade Now', 'https://stallion.exchange'),
            Markup.button.url('📈 Live Chart', `https://dexscreener.com/polygon/${exchangeAddress}`)
        ]
    ]);

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...keyboard
        });
        console.log(`✅ ${isHistory ? 'History' : 'Live'} ${type} Alert Sent!`);
    } catch (e) { console.error("❌ Alert Error:", e.message); }
}

// 5. History & Live Monitoring Logic
async function startMonitoring() {
    console.log("🔍 Syncing Past Transactions & Starting Live Monitor...");
    let lastBlock;

    try {
        const currentBlock = await provider.getBlockNumber();
        // Pichle 5000 blocks (approx 3-4 ghante) ka data sync karega
        const fromBlock = currentBlock - 5000; 
        lastBlock = currentBlock;

        console.log(`Syncing from block ${fromBlock} to ${currentBlock}...`);

        // 1. Past Transactions Fetching
        const pastLogs = await provider.getLogs({
            address: exchangeAddress,
            fromBlock: fromBlock,
            toBlock: currentBlock
        });

        for (const log of pastLogs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed.name === 'Bought') {
                    const usdt = parseFloat(ethers.formatUnits(parsed.args[3], 6));
                    const stn = parseFloat(ethers.formatUnits(parsed.args[4], 18));
                    await handleTrade('BUY', parsed.args[1], usdt, stn, log.transactionHash, true);
                } else if (parsed.name === 'Sold') {
                    const stn = parseFloat(ethers.formatUnits(parsed.args[3], 18));
                    const usdt = parseFloat(ethers.formatUnits(parsed.args[4], 6));
                    await handleTrade('SELL', parsed.args[1], usdt, stn, log.transactionHash, true);
                }
            } catch (e) {}
        }
        console.log("✅ History Sync Complete. Now monitoring LIVE...");

        // 2. Live Polling
        setInterval(async () => {
            try {
                const latest = await provider.getBlockNumber();
                if (latest > lastBlock) {
                    const liveLogs = await provider.getLogs({
                        address: exchangeAddress,
                        fromBlock: lastBlock + 1,
                        toBlock: latest
                    });

                    for (const log of liveLogs) {
                        try {
                            const parsed = contract.interface.parseLog(log);
                            if (parsed.name === 'Bought') {
                                const usdt = parseFloat(ethers.formatUnits(parsed.args[3], 6));
                                const stn = parseFloat(ethers.formatUnits(parsed.args[4], 18));
                                await handleTrade('BUY', parsed.args[1], usdt, stn, log.transactionHash);
                            } else if (parsed.name === 'Sold') {
                                const stn = parseFloat(ethers.formatUnits(parsed.args[3], 18));
                                const usdt = parseFloat(ethers.formatUnits(parsed.args[4], 6));
                                await handleTrade('SELL', parsed.args[1], usdt, stn, log.transactionHash);
                            }
                        } catch (e) {}
                    }
                    lastBlock = latest;
                }
            } catch (e) { console.error("Polling Error:", e.message); }
        }, 15000);

    } catch (e) {
        console.error("Startup Error:", e.message);
        setTimeout(startMonitoring, 5000);
    }
}

// 6. Launch Sequence
async function runBot() {
    try {
        await bot.launch({ dropPendingUpdates: true });
        console.log("🚀 STALLION PREMIUM IS LIVE!");
        startMonitoring();
    } catch (err) {
        setTimeout(runBot, 10000); 
    }
}

runBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));