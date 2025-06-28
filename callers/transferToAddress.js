import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PACKAGE_ID = process.env.PACKAGE_ID;
const MODULE_NAME = process.env.MODULE_NAME;
const SENDER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const FIXED_GAS_BUDGET = 100_000_000; // 0.1 SUI in MIST

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

async function executeTransaction(txb, keypair) {
    try {
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: keypair,
            options: {
                showEffects: true,
                showEvents: true,
                showObjects: true,
            },
        });
        return result;
    } catch (error) {
        throw new Error(`Transaction execution failed: ${error.message}`);
    }
}

async function checkBalance(walletAddress) {
    try {
        const balance = await client.getBalance({ owner: walletAddress });
        return parseInt(balance.totalBalance); // Balance in MIST
    } catch (error) {
        throw new Error(`Failed to check balance: ${error.message}`);
    }
}

export async function transferToAddress({
        senderPrivateKey = SENDER_PRIVATE_KEY,
        recipientAddress = '0x28b7cefa1e46d3e6d695a0f465b72033279e076bb7240c7715ec5950e9004e08',
        amount = 7_000_000,
    }) {
    try {
        const senderKeypair = getKeypairFromPrivateKey(senderPrivateKey);
        const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

        console.log(`Sender address: ${senderAddress}`);
        console.log(`Recipient address: ${recipientAddress}`);
        console.log(`Transfer amount: ${amount} MIST`);

        if (!recipientAddress || !recipientAddress.startsWith('0x')) {
            throw new Error('Invalid recipient wallet address');
        }
        if (!amount || amount <= 0) {
            throw new Error('Invalid transfer amount');
        }

        const balance = await checkBalance(senderAddress);
        console.log(`Sender total balance: ${balance} MIST`);
        if (balance < amount + FIXED_GAS_BUDGET) {
            throw new Error(`Insufficient balance for transfer (${amount} MIST) and gas (${FIXED_GAS_BUDGET} MIST)`);
        }



        const txb = new TransactionBlock();

        txb.moveCall({
            target: `${PACKAGE_ID}::${MODULE_NAME}::transfer_tothe_address`,
            arguments: [
                txb.gas,
                txb.pure.address(recipientAddress),
                txb.pure.u64(amount),
            ],
        });

        txb.setGasBudget(FIXED_GAS_BUDGET);

        console.log('Transaction block prepared, executing...');
        const result = await executeTransaction(txb, senderKeypair);
        console.log(`Transaction successful, digest: ${result.digest}`);

        return {
            success: true,
            transactionDigest: result.digest,
            senderAddress,
        };
    } catch (error) {
        console.error('Transfer failed:', error);
        return { success: false, error: `Transfer failed: ${error.message}` };
    }
}

export function getSenderAddress(senderPrivateKey = SENDER_PRIVATE_KEY) {
    try {
        const keypair = getKeypairFromPrivateKey(senderPrivateKey);
        return keypair.getPublicKey().toSuiAddress();
    } catch (error) {
        console.error('Failed to derive sender address:', error);
        throw new Error('Invalid private key');
    }
}