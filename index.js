require('dotenv').config();
const { ethers } = require('ethers');
const { Markup, Telegraf } = require('telegraf');
const http = require('http');

// 1. Render Stay-Alive Server
// Iske bina Cron-job kaam nahi karega aur Render bot ko band kar dega
http.createServer((req, res) => {
    res.write('Stallion Bot is Active!');
    res.end();
}).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const provider = new ethers.WebSocketProvider(process.env.RPC_URL);
const exchangeAddress = process.env.CONTRACT_ADDRESS;

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

const getButtons = (txHash) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.url('🌐 Stallion Exchange', 'https://stallion.exchange'),
            Markup.button.url('🔍 Transaction Details', `https://polygonscan.com/tx/${txHash}`)
        ],
        [
            Markup.button.url('🚀 Start Trading Now', 'https://stallion.exchange/trade')
        ]
    ]);
};

async function handleTrade(type, user, usdt, tokens, price, txHash) {
    const isBuy = type === 'BUY' || type === 'TEST';
    const title = type === 'BUY' ? '🟢 **STALLION BUY DETECTED!** 🚀' : 
                  type === 'SELL' ? '🔴 **STALLION SELL DETECTED!** 📉' : 
                  '🔥 **POLYGON MOVEMENT (TEST)**';

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Amount:** \`${usdt.toFixed(2)} USDT\`
💎 **Tokens:** \`${tokens ? tokens.toLocaleString() : 'N/A'}\`
🏷 **Price:** \`${price ? price.toFixed(6) : 'Market Price'} USDT\`

👤 **User:** [${user.substring(0, 6)}...](https://polygonscan.com/address/${user})
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            ...getButtons(txHash)
        });
        console.log(`✅ ${type} Alert Sent!`);
    } catch (e) { 
        console.error("Telegram Error:", e.description || "Rate Limit Hit"); 
    }
}

console.log("-----------------------------------------");
console.log("🚀 STALLION TRACKER STARTING...");
console.log("-----------------------------------------");

contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    handleTrade('BUY', user, parseFloat(ethers.formatUnits(usdtIn, 6)), parseFloat(ethers.formatUnits(tokenOut, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    handleTrade('SELL', user, parseFloat(ethers.formatUnits(usdtOut, 6)), parseFloat(ethers.formatUnits(tokenIn, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

// --- RATE LIMIT FIX FOR TESTING ---
if (exchangeAddress.toLowerCase() === "0xc2132d05d31c914a87c6611c10748aeb04b58e8f") {
    console.log("⚠️ USDT Testing Mode: Filtering for BIG transactions only");
    contract.on("Transfer", (from, to, value, event) => {
        const amt = parseFloat(ethers.formatUnits(value, 6));
        // Testing mein sirf $10,000+ ke alerts bhejo taaki Telegram block na kare
        if (amt >= 10000) { 
            handleTrade('TEST', from, amt, 0, 0, event.log.transactionHash);
        }
    });
}

bot.launch().then(() => console.log("🤖 Bot Connected Successfully!"));

provider.on("error", (e) => console.log("Provider Error:", e));