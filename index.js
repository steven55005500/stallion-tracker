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

// Real Stallion Abi (Bought & Sold are the main events)
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
            Markup.button.url('🔍 PolygonScan', `https://polygonscan.com/tx/${txHash}`)
        ]
    ]);
};

async function handleTrade(type, user, usdt, tokens, price, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION BUY!** 🚀' : 
                  type === 'SELL' ? '🔴 **STALLION SELL!** 📉' : 
                  '🔥 **STALLION TRANSACTION**';

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`${usdt.toFixed(2)} USDT\`
💎 **Tokens:** \`${tokens ? tokens.toLocaleString() : 'N/A'}\`
🏷 **Price:** \`${price ? price.toFixed(6) : 'Market'} USDT\`

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
        console.error("Telegram Error:", e.description || "Rate Limit"); 
    }
}

// Listen for REAL trades (No minimum amount filter - tracks EVERYTHING)
contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    handleTrade('BUY', user, parseFloat(ethers.formatUnits(usdtIn, 6)), parseFloat(ethers.formatUnits(tokenOut, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    handleTrade('SELL', user, parseFloat(ethers.formatUnits(usdtOut, 6)), parseFloat(ethers.formatUnits(tokenIn, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

// Testing Logic (Only active if address is USDT)
if (exchangeAddress.toLowerCase() === "0xc2132d05d31c914a87c6611c10748aeb04b58e8f") {
    contract.on("Transfer", (from, to, value, event) => {
        const amt = parseFloat(ethers.formatUnits(value, 6));
        if (amt >= 1000) { handleTrade('TEST', from, amt, 0, 0, event.log.transactionHash); }
    });
}

bot.launch().then(() => console.log("🤖 Stallion Bot Connected!"));
provider.on("error", (e) => console.log("Provider Error:", e));