import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PACKAGE_ID = process.env.PACKAGE_ID;
const MODULE_NAME = process.env.MODULE_NAME;
const FIXED_GAS_BUDGET = 100_000_000;


function getKeypairFromPrivateKey(hexKey) {
    if (!hexKey) {
        throw new Error('Private key is required');
    }
    let privateKey = hexKey.startsWith('0x') ? hexKey.slice(2) : hexKey;

    if (privateKey.length !== 64) {
        throw new Error(`Invalid private key length: ${privateKey.length} characters (expected 64)`);
    }

    let secretKey;
    try {
        secretKey = Buffer.from(privateKey, 'hex');
    } catch (error) {
        throw new Error(`Invalid hex string in private key: ${error.message}`);
    }
    if (secretKey.length !== 32) {
        throw new Error(`Invalid private key byte length: ${secretKey.length} bytes (expected 32)`);
    }
    try {
        return Ed25519Keypair.fromSecretKey(secretKey);
    } catch (error) {
        throw new Error(`Failed to derive keypair: ${error.message}`);
    }
}

async function checkBalance(walletAddress) {
    try {
        const balance = await client.getBalance({ owner: walletAddress });
        return parseInt(balance.totalBalance); // Balance in MIST
    } catch (error) {
        console.error(`Failed to check balance for ${walletAddress}:`, error);
        throw error;
    }
}

async function executeTransaction(txb, keypair) {
    try {
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: keypair,
            options: {
                showEffects: true,
                showEvents: true,
            },
        });
        console.log('Transaction result:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error('Transaction failed:', error.stack);
        throw error;
    }
}



export async function depositToWallet({
          senderPrivateKey,
          walletId = "0x03355332cb05eb346e8b71de30c374726bb703f00c15582b598e11a01693009e",
          amountInMist = 30_000_000
      }) {
    try {
        if (!senderPrivateKey) {
            throw new Error('Sender private key is required');
        }
        if (!walletId || !walletId.startsWith('0x')) {
            throw new Error('Invalid wallet object ID');
        }
        if (!amountInMist || amountInMist <= 0) {
            throw new Error('Invalid deposit amount');
        }

        if (!Number.isInteger(amountInMist)) {
            throw new Error(`Amount must be an integer in MIST, got ${amountInMist}`);
        }

        const senderKeypair = getKeypairFromPrivateKey(senderPrivateKey);
        const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

        const addressBalance = await checkBalance(senderAddress);
        console.log(`Sender address balance: ${addressBalance} MIST`);

        if (addressBalance < amountInMist + FIXED_GAS_BUDGET) {
            throw new Error(`Insufficient address balance for deposit (${amountInMist} MIST) and gas (${FIXED_GAS_BUDGET} MIST): ${addressBalance} MIST available`);
        }

        const txb = new TransactionBlock();
        txb.setSender(senderAddress);
        const [coin] = txb.splitCoins(txb.gas, [txb.pure(amountInMist)]);
        txb.moveCall({
            target: `${PACKAGE_ID}::${MODULE_NAME}::deposit`,
            arguments: [
                txb.object(walletId),
                coin,
            ],
        });

        console.log(`Using fixed gas budget: ${FIXED_GAS_BUDGET} MIST`);
        txb.setGasBudget(FIXED_GAS_BUDGET);

        console.log(`Depositing ${amountInMist} MIST to wallet ${walletId}...`);
        const result = await executeTransaction(txb, senderKeypair);
        return {
            success: true,
            transactionDigest: result.digest,
            senderAddress,
        };
    } catch (error) {
        console.error(`Failed to deposit to wallet ${walletId}:`, error.stack);
        return { success: false, error: `Deposit failed: ${error.message}` };
    }
}