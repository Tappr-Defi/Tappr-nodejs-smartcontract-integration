import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PACKAGE_ID = process.env.PACKAGE_ID;
const MODULE_NAME = process.env.MODULE_NAME;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FIXED_GAS_BUDGET = 100_000_000; // 0.1 SUI in MIST


function getKeypairFromPrivateKey(hexKey) {
    if (!hexKey) {
        throw new Error('Private key is required. Ensure PRIVATE_KEY is set in .env.');
    }
    let privateKey = hexKey.startsWith('0x') ? hexKey.slice(2) : hexKey;
    if (privateKey.length !== 64) {
        throw new Error(`Invalid private key length: ${privateKey.length} characters (expected 64)`);
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

async function checkBalance(walletAddress) {
    try {
        const balance = await client.getBalance({ owner: walletAddress });
        return parseInt(balance.totalBalance); // Balance in MIST
    } catch (error) {
        throw new Error(`Failed to check balance: ${error.message}`);
    }
}


export async function createSuiAddressOnChain(derivedAddress) {
    let senderAddress = 'unknown address';
    try {
        if (!PRIVATE_KEY) {
            throw new Error('Private key is required in .env to sign the transaction.');
        }
        if (!PACKAGE_ID || !MODULE_NAME) {
            throw new Error('PACKAGE_ID and MODULE_NAME must be set in .env');
        }
        if (!derivedAddress || !derivedAddress.startsWith('0x')) {
            throw new Error('Invalid or missing derivedAddress');
        }

        const signerKeypair = getKeypairFromPrivateKey(PRIVATE_KEY);
        senderAddress = signerKeypair.getPublicKey().toSuiAddress();

        console.log(`Sender address (for gas): ${senderAddress}`);
        console.log(`Derived zkLogin wallet address: ${derivedAddress}`);

        const balance = await checkBalance(senderAddress);
        console.log(`Sender total balance: ${balance} MIST`);
        if (balance < FIXED_GAS_BUDGET) {
            throw new Error(`Insufficient balance for gas (${FIXED_GAS_BUDGET} MIST). Current balance: ${balance} MIST`);
        }

        const txb = new TransactionBlock();
        txb.moveCall({
            target: `${PACKAGE_ID}::${MODULE_NAME}::create_address`,
            arguments: [txb.pure.address(derivedAddress)],
        });
        txb.setGasBudget(FIXED_GAS_BUDGET);

        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: signerKeypair,
            options: { showEffects: true, showEvents: true, showObjects: true },
        });

        if (result.effects?.status?.status !== 'success') {
            throw new Error(`Transaction failed: ${result.effects?.status?.error || 'Unknown error'}`);
        }

        const createdObject = result.effects?.created?.[0];
        const walletObjectId = createdObject?.reference?.objectId;

        if (!walletObjectId) {
            throw new Error('Failed to extract Wallet object ID from transaction effects');
        }

        const walletEvent = result.events?.find(event =>
            event.type === `${PACKAGE_ID}::${MODULE_NAME}::WalletCreatedEvent`
        );
        const walletAddress = walletEvent?.parsedJson?.wallet_id;
        const eventOwner = walletEvent?.parsedJson?.owner;

        if (!walletAddress || !eventOwner) {
            throw new Error('Failed to extract WalletCreatedEvent, wallet_id, or owner');
        }

        if (eventOwner !== derivedAddress) {
            throw new Error(`On-chain owner (${eventOwner}) does not match the derived address (${derivedAddress})`);
        }

        console.log(`Wallet created with object ID: ${walletObjectId}, address: ${walletAddress}, owner: ${eventOwner}`);

        return {
            success: true,
            walletObjectId,
            walletAddress: derivedAddress,
            transactionDigest: result.digest,
            senderAddress,
        };
    } catch (error) {
        console.error(`Failed to create Wallet for ${senderAddress}:`, error);
        return {
            success: false,
            error: `Failed to create Wallet: ${error.message}`,
        };
    }
}

