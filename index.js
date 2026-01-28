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

const exchangeAddress = process.env.CONTRACT_ADDRESS; 
const STALLION_TOKEN_ADDRESS = "0x94Abf62b41f815448eEDBE9eC10f10576D9D6004";

const abi = [
    "event Bought(uint256 tdate, address indexed user, address indexed token, uint256 usdtIn, uint256 tokenOut, uint256 price)",
    "event Sold(uint256 tdate, address indexed user, address indexed token, uint256 tokenIn, uint256 usdtOut, uint256 price)",
    "function pool(address token) external view returns (uint256 tokenReserve, uint256 usdtReserve)"
];

const contract = new ethers.Contract(exchangeAddress, abi, provider);

// Pool se live liquidity fetch karne ka function
async function getPoolData() {
    try {
        const pData = await contract.pool(STALLION_TOKEN_ADDRESS);
        return {
            tokenRes: parseFloat(ethers.formatUnits(pData.tokenReserve, 18)),
            usdtRes: parseFloat(ethers.formatUnits(pData.usdtReserve, 6))
        };
    } catch (e) {
        return null;
    }
}

async function handleTrade(type, user, usdt, tokens, eventPrice, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION BUY!** 🚀' : '🔴 **STALLION SELL!** 📉';
    
    // Auto-calculate price if event price is 0
    let finalPrice = eventPrice;
    if (!finalPrice || finalPrice === 0) {
        finalPrice = (tokens > 0) ? (usdt / tokens) : 0;
    }

    // Liquidity check for message
    const pool = await getPoolData();
    const liquidityInfo = pool ? `🌊 **Liquidity:** \`$${pool.usdtRes.toLocaleString()}\`` : '';

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`$${usdt.toFixed(2)} USDT\`
💎 **Amount:** \`${tokens.toLocaleString(undefined, {minimumFractionDigits: 2})} STN\`
🏷 **Price:** \`${finalPrice.toFixed(6)} USDT\`

👤 **User:** [${user.substring(0, 6)}...](https://polygonscan.com/address/${user})
${liquidityInfo}
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [
                    Markup.button.url('🌐 Exchange', 'https://stallion.exchange'),
                    Markup.button.url('🔍 PolygonScan', `https://polygonscan.com/tx/${txHash}`)
                ]
            ])
        });
        console.log(`✅ ${type} Sent | Price: ${finalPrice.toFixed(6)}`);
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

bot.launch().then(() => console.log("🤖 Stallion Premium Bot Active!"));