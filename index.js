require('dotenv').config();
const { ethers } = require('ethers');
const { Markup, Telegraf } = require('telegraf');
const http = require('http');

// 1. Render Stay-Alive Server
http.createServer((req, res) => {
    res.write('Stallion Bot is Active!');
    res.end();
}).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const provider = new ethers.WebSocketProvider(process.env.RPC_URL);
const exchangeAddress = process.env.CONTRACT_ADDRESS;
const STALLION_TOKEN_ADDRESS = "0x8E54caAAfa88A1b445e3De7c9a6C62719b8f6fC3";

// ABI setup
const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// Function to fetch Live Price
async function getLivePrice() {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${STALLION_TOKEN_ADDRESS}`);
        const data = await response.json();
        // Agar market price milti hai toh wo return karega, warna contract wala price fallback rakhega
        return data.pairs && data.pairs.length > 0 ? parseFloat(data.pairs[0].priceUsd) : null;
    } catch (e) {
        console.error("Price Fetch Error:", e);
        return null;
    }
}

const getButtons = (txHash) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.url('🌐 Stallion Exchange', 'https://stallion.exchange'),
            Markup.button.url('🔍 PolygonScan', `https://polygonscan.com/tx/${txHash}`)
        ]
    ]);
};

async function handleTrade(type, user, usdt, tokens, contractPrice, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION TOKEN BUY!** 🚀' : 
                  type === 'SELL' ? '🔴 **STALLION TOKEN SELL!** 📉' : 
                  '🔥 **STALLION TRANSACTION**';

    // Live Price Fetching logic
    const livePrice = await getLivePrice();
    const finalPrice = livePrice || contractPrice; // Agar API fail hui toh contract ka price dikhayega
    const finalValue = livePrice ? (tokens * livePrice) : usdt; // Live value calculation

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`${finalValue.toFixed(2)} USDT\`
💎 **Tokens:** \`${tokens ? tokens.toLocaleString() : 'N/A'}\`
🏷 **Price:** \`${finalPrice ? finalPrice.toFixed(6) : 'Market'} USDT\`

👤 **User:** [${user.substring(0, 6)}...](https://polygonscan.com/address/${user})
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            ...getButtons(txHash)
        });
        console.log(`✅ ${type} Alert Sent with Live Price!`);
    } catch (e) { 
        console.error("Telegram Error:", e.description || "Rate Limit"); 
    }
}

// Events Listening
contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    handleTrade('BUY', user, parseFloat(ethers.formatUnits(usdtIn, 6)), parseFloat(ethers.formatUnits(tokenOut, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    handleTrade('SELL', user, parseFloat(ethers.formatUnits(usdtOut, 6)), parseFloat(ethers.formatUnits(tokenIn, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

// Test Mode
if (exchangeAddress.toLowerCase() === "0xc2132d05d31c914a87c6611c10748aeb04b58e8f") {
    contract.on("Transfer", (from, to, value, event) => {
        const amt = parseFloat(ethers.formatUnits(value, 6));
        if (amt >= 1000) { handleTrade('TEST', from, amt, 0, 0, event.log.transactionHash); }
    });
}

bot.launch().then(() => console.log("🤖 Stallion Bot Connected!"));
provider.on("error", (e) => console.log("Provider Error:", e));