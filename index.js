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

// 1. EXCHANGE CONTRACT (Jahan events ho rahe hain - Buy/Sell)
const exchangeAddress = process.env.CONTRACT_ADDRESS; 

// 2. TOKEN ADDRESS (Jo site par dikh raha hai - Price fetch karne ke liye)
const STALLION_TOKEN_ADDRESS = "0x94Abf62b41f815448eEDBE9eC10f10576D9D6004";

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// API for live price (Using the correct Token Address)
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

async function handleTrade(type, user, usdt, tokens, contractPrice, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION TOKEN BUY!** 🚀' : '🔴 **STALLION TOKEN SELL!** 📉';

    let livePrice = await getLivePrice();
    
    // Logic: Pehle API Price, phir Contract Price, phir Math (USDT/Tokens)
    let finalPrice = livePrice || contractPrice;
    if (!finalPrice || finalPrice === 0) {
        finalPrice = (tokens > 0 && usdt > 0) ? (usdt / tokens) : 0;
    }

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`${usdt.toFixed(2)} USDT\`
💎 **Tokens:** \`${tokens ? tokens.toLocaleString() : 'N/A'} STN\`
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
        console.log(`✅ ${type} Sent! Price: ${finalPrice.toFixed(6)}`);
    } catch (e) { 
        console.error("Telegram Error:", e.description); 
    }
}

contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    const usdt = parseFloat(ethers.formatUnits(usdtIn, 6));
    const stn = parseFloat(ethers.formatUnits(tokenOut, 18));
    const p = parseFloat(ethers.formatUnits(price, 18));
    handleTrade('BUY', user, usdt, stn, p, event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    const usdt = parseFloat(ethers.formatUnits(usdtOut, 6));
    const stn = parseFloat(ethers.formatUnits(tokenIn, 18));
    const p = parseFloat(ethers.formatUnits(price, 18));
    handleTrade('SELL', user, usdt, stn, p, event.log.transactionHash);
});

bot.launch().then(() => console.log("🤖 Stallion Bot Connected with Fixes!"));