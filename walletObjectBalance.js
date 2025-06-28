import { checkWalletBalance } from './callers/depositToWallet.js';
checkWalletBalance("0x03355332cb05eb346e8b71de30c374726bb703f00c15582b598e11a01693009e").then(balance => {
    console.log(`Wallet balance: ${balance} MIST`);
});