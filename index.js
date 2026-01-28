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
    } catch (e) { return null; }
}

async function handleTrade(type, user, usdt, tokens, eventPrice, txHash) {
    const title = type === 'BUY' ? '🟢 **STALLION BUY!** 🚀' : '🔴 **STALLION SELL!** 📉';
    
    // 🏷 Price Calculation (0.00 fix)
    let calcPrice = (tokens > 0) ? (usdt / tokens) : 0;
    let finalPrice = (eventPrice && eventPrice > 0) ? eventPrice : calcPrice;

    // 🌊 Liquidity Data from Site/Contract
    const pool = await getPoolData();
    const liquidityInfo = pool ? `🌊 **Liquidity:** \`$${pool.usdtRes.toLocaleString(undefined, {minimumFractionDigits: 2})} USDT\`` : '';

    const message = `
${title}
━━━━━━━━━━━━━━━━━━━━━━
💰 **Value:** \`$${usdt.toFixed(2)} USDT\`
💎 **Amount:** \`${tokens.toLocaleString(undefined, {minimumFractionDigits: 2})} STN\`
 
👤 **User:** [${user.substring(0, 6)}...](https://polygonscan.com/address/${user})
${liquidityInfo}
━━━━━━━━━━━━━━━━━━━━━━
🔗 **Tx:** [View Transaction](https://polygonscan.com/tx/${txHash})
━━━━━━━━━━━━━━━━━━━━━━
    `;

    try {
        await bot.telegram.sendMessage(process.env.CHANNEL_ID, message, { 
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [
                    Markup.button.url('🌐 Stallion Exchange', 'https://stallion.exchange'),
                    Markup.button.url('🔍 PolygonScan', `https://polygonscan.com/tx/${txHash}`)
                ]
            ])
        });
        console.log(`✅ ${type} Alert Sent | Price: ${finalPrice.toFixed(6)}`);
    } catch (e) { 
        console.error("Telegram Error:", e.description || "Send Error"); 
    }
}

// Events
contract.on("Bought", (tdate, user, token, usdtIn, tokenOut, price, event) => {
    handleTrade('BUY', user, parseFloat(ethers.formatUnits(usdtIn, 6)), parseFloat(ethers.formatUnits(tokenOut, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

contract.on("Sold", (tdate, user, token, tokenIn, usdtOut, price, event) => {
    handleTrade('SELL', user, parseFloat(ethers.formatUnits(usdtOut, 6)), parseFloat(ethers.formatUnits(tokenIn, 18)), parseFloat(ethers.formatUnits(price, 18)), event.log.transactionHash);
});

// Launch with Conflict Fix
bot.launch({
    dropPendingUpdates: true // Isse purane conflict aur pending messages clear ho jayenge
}).then(() => {
    console.log("🤖 Stallion Premium Bot Active!");
}).catch((err) => {
    console.error("❌ Launch Error:", err.message);
    if (err.message.includes("409")) {
        console.log("Conflict detected. Restarting...");
        process.exit(1);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));