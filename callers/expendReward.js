import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';


const SENDER_PRIVATE_KEY = process.env.PRIVATE_KEY;

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

export async function expendReward({
         senderPrivateKey = SENDER_PRIVATE_KEY,
         recipientWalletId,
         amount = 12_000_000, // Amount in MIST (0.012 SUI)
     }) {
    try {
        if (!senderPrivateKey) {
            throw new Error('senderPrivateKey is required');
        }
        if (!recipientWalletId || !recipientWalletId.startsWith('0x')) {
            throw new Error('Invalid recipient wallet address');
        }
        if (!amount || amount <= 0) {
            throw new Error('Invalid transfer amount');
        }

        const senderKeypair = getKeypairFromPrivateKey(senderPrivateKey);
        const derivedSenderAddress = senderKeypair.getPublicKey().toSuiAddress();
        const senderAddress = "0x52f03ac4ac477f9ec51f0e51b9a6d720a311e3a8c0c11cd8c2eeb9eb44d475e5";

        if (senderAddress && senderAddress !== derivedSenderAddress) {
            throw new Error('Provided sender address does not match derived sender address');
        }

        console.log(`Funding ${amount} MIST to ${recipientWalletId} from ${derivedSenderAddress}`);

        const txb = new TransactionBlock();
        const [coin] = txb.splitCoins(txb.gas, [amount]);
        txb.transferObjects([coin], recipientWalletId);

        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: senderKeypair,
            requestType: 'WaitForLocalExecution',
            options: { showEffects: true },
        });

        return {
            success: true,
            transactionDigest: result.digest,
            senderAddress: derivedSenderAddress,
            message: `Successfully funded ${(amount / 1_000_000_000).toFixed(9)} SUI to ${recipientWalletId}`,
        };
    } catch (error) {
        console.error('Native SUI funding failed:', error);
        return { success: false, error: `Funding failed: ${error.message}` };
    }
}
