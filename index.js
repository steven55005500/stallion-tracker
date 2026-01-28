require('dotenv').config();
const { ethers } = require('ethers');
const { Markup, Telegraf } = require('telegraf');
const http = require('http');

// Stay-Alive Server
http.createServer((req, res) => {
    res.write('Stallion Bot is Active!');
    res.end();
}).listen(process.env.PORT || 3000);

const bot = new Telegraf(process.env.BOT_TOKEN);
const provider = new ethers.WebSocketProvider(process.env.RPC_URL);

// Contract Address (StallionExchange)
const exchangeAddress = process.env.CONTRACT_ADDRESS; 
// Token Address (STN)
const STALLION_TOKEN_ADDRESS = "0x94Abf62b41f815448eEDBE9eC10f10576D9D6004";

// Exact ABI from your shared Smart Contract
const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// Function to fetch Live Price from DexScreener (Optional Fallback)
async function getLivePrice() {
    try {
        const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${STALLION_TOKEN_ADDRESS}`);
        const data = await response.json();
        return data.pairs && data.pairs.length > 0 ? parseFloat(data.pairs[0].priceUsd) : null;
    } catch (e) {
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

async function handleTrade(type, user, usdt, tokens, eventPrice, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION TOKEN BUY!** 🚀' : '🔴 **STALLION TOKEN SELL!** 📉';

    let livePrice = await getLivePrice();
    
    // Aapke contract ke hisab se price 1e18 format mein hai
    // Agar eventPrice mil raha hai toh woh accurate market rate hai
    let finalPrice = livePrice || eventPrice;

    // Safety Calculation: Agar price 0 aa jaye toh Math use karein
    if (!finalPrice || finalPrice === 0) {
        finalPrice = (tokens > 0 && usdt > 0) ? (usdt / tokens) : 0;
    }

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`${usdt.toFixed(2)} USDT\`
💎 **Amount:** \`${tokens ? tokens.toLocaleString(undefined, {minimumFractionDigits: 2}) : 'N/A'} STN\`
🏷 **Price:** \`${finalPrice.toFixed(6)} USDT\`

👤 **User:** [${user.substring(0, 6)}...](https://polygonscan.com/address/${user})
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...getButtons(txHash)
        });
        console.log(`✅ Alert Sent: ${type} | Price: ${finalPrice.toFixed(6)}`);
    } catch (e) { 
        console.error("Telegram Error:", e.description || "Connection Error"); 
    }
}

// ---------------------------------------------------------
// EVENT LISTENERS (Contract logic ke decimals ke hisab se)
// ---------------------------------------------------------

contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    // USDT is 6 decimals in your contract
    const usdt = parseFloat(ethers.formatUnits(usdtIn, 6));
    // STN Token is 18 decimals
    const stn = parseFloat(ethers.formatUnits(tokenOut, 18));
    // Price in contract is (usdtReserve * 1e18 / tokenReserve)
    const p = parseFloat(ethers.formatUnits(price, 18));
    
    handleTrade('BUY', user, usdt, stn, p, event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    // USDT is 6 decimals
    const usdt = parseFloat(ethers.formatUnits(usdtOut, 6));
    // STN Token is 18 decimals
    const stn = parseFloat(ethers.formatUnits(tokenIn, 18));
    // Price is 18 decimals
    const p = parseFloat(ethers.formatUnits(price, 18));
    
    handleTrade('SELL', user, usdt, stn, p, event.log.transactionHash);
});

bot.launch().then(() => console.log("🤖 Stallion Exchange Bot is LIVE!"));

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));