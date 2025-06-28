import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PACKAGE_ID = process.env.PACKAGE_ID;
const MODULE_NAME = process.env.MODULE_NAME;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const senderAddress = '0x52f03ac4ac477f9ec51f0e51b9a6d720a311e3a8c0c11cd8c2eeb9eb44d475e5';

function getKeypairFromPrivateKey(hexKey) {
    if (!hexKey)
        throw new Error('Private key is required. Ensure PRIVATE_KEY is set in .env or passed as an argument.');
    let privateKey = hexKey.startsWith('0x') ? hexKey.slice(2) : hexKey;
    if (privateKey.length !== 64)
        throw new Error(`Invalid private key length: ${privateKey.length} characters (expected 64)`);
    try {
        const secretKey = Buffer.from(privateKey, 'hex');
        if (secretKey.length !== 32)
        throw new Error(`Invalid private key byte length: ${secretKey.length} bytes (expected 32)`);
        return Ed25519Keypair.fromSecretKey(secretKey);
    } catch (error) {
        throw new Error(`Failed to derive keypair: ${error.message}`);
    }
}


export async function createWallet({
       privateKey = PRIVATE_KEY,
       address = senderAddress } = {}) {
    try {
        if (!privateKey) {
            throw new Error('Private key is required to sign the transaction.');
        }
        if (!address || !address.startsWith('0x')) {
            throw new Error('Valid SUI address is required.');
        }

        const keypair = getKeypairFromPrivateKey(privateKey);
        const derivedAddress = keypair.getPublicKey().toSuiAddress();

        if (address !== derivedAddress) {
            throw new Error(`Provided address ${address} does not match the address derived from the private key: ${derivedAddress}`);
        }

        if (!PACKAGE_ID || !MODULE_NAME) {
            throw new Error('PACKAGE_ID and MODULE_NAME must be set in .env');
        }



        const txb = new TransactionBlock();
        txb.moveCall({
            target: `${PACKAGE_ID}::${MODULE_NAME}::create_wallet`,
            arguments: [],
        });

        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: keypair,
            options: { showEffects: true, showEvents: true },
        });

        const createdObject = result.effects?.created?.[0];
        const walletObjectId = createdObject?.reference?.objectId;

        if (!walletObjectId) {
            throw new Error('Failed to extract Wallet object ID from transaction effects');
        }

        return {
            success: true,
            walletObjectId,
            transactionDigest: result.digest,
            address,
        };
    } catch (error) {
        console.error(`Failed to create Wallet for ${address}:`, error);
        return {
            success: false,
            error: `Failed to create Wallet: ${error.message}`,
        };
    }
}

