import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PRIVATE_KEY = process.env.PRIVATE_KEY;


export async function fundSuiAddress({
         senderPrivateKey = PRIVATE_KEY,
         recipientWalletId,
         amount,
     }) {
    try {
        if (!senderPrivateKey) {
            throw new Error('Sender private key is required');
        }
        if (!recipientWalletId || !recipientWalletId.match(/^0x[0-9a-fA-F]{64}$/)) {
            throw new Error('Invalid recipient wallet address: must be a 66-character hex string starting with 0x');
        }
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount: must be a positive number');
        }

        const amountInMist = Math.floor(amount * 1_000_000_000);
        if (amountInMist < 1_000_000) {
            throw new Error(`Amount too small: ${amount} SUI is ${amountInMist} MIST, minimum 0.001 SUI`);
        }

        const senderKeypair = getKeypairFromPrivateKey(senderPrivateKey);
        const senderAddress = senderKeypair.getPublicKey().toSuiAddress();

        const balance = await client.getBalance({ owner: senderAddress });
        const totalBalance = parseInt(balance.totalBalance);
        const gasBudget = 100_000_000;
        if (totalBalance < amountInMist + gasBudget) {
            throw new Error(`Insufficient balance: ${totalBalance} MIST, needed ${amountInMist + gasBudget} MIST`);
        }

        console.log(`Funding ${amount} SUI (${amountInMist} MIST) to ${recipientWalletId} from ${senderAddress}`);


        const txb = new TransactionBlock();
        const [coin] = txb.splitCoins(txb.gas, [amountInMist]);
        txb.transferObjects([coin], recipientWalletId);
        txb.setGasBudget(gasBudget);

        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: senderKeypair,
            requestType: 'WaitForLocalExecution',
            options: { showEffects: true },
        });

        if (result.effects?.status?.status !== 'success') {
            throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
        }

        return {
            success: true,
            transactionDigest: result.digest,
            senderAddress,
            amountInSui: amount,
            amountInMist,
            message: `Successfully funded ${amount} SUI to ${recipientWalletId}`,
        };
    } catch (error) {
        console.error(`Failed to fund ${recipientWalletId}:`, error);
        return {
            success: false,
            error: `Funding failed: ${error.message}`,
        };
    }
}


function getKeypairFromPrivateKey(hexKey) {
    let privateKey = hexKey.startsWith('0x') ? hexKey.slice(2) : hexKey;

    if (privateKey.length !== 64 || !/^[0-9a-fA-F]+$/.test(privateKey)) {
        throw new Error('Invalid private key: must be a 64-character hex string');
    }

    try {
        const secretKey = Buffer.from(privateKey, 'hex');
        if (secretKey.length !== 32) {
            throw new Error(`Invalid private key byte length: ${secretKey.length} bytes (expected 32)`);
        }
        return Ed25519Keypair.fromSecretKey(secretKey);
    } catch (error) {
        throw new Error(`Failed to derive keypair: ${error.message}`);
    }
}

