// verifyKey.js

import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import * as dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.PRIVATE_KEY;

if (!privateKey) {
    throw new Error('PRIVATE_KEY not found in .env file');
}

const privateKeyHex = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
let privateKeyBytes;
try {
    privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
} catch (error) {
    throw new Error('Invalid hex string in PRIVATE_KEY');
}

console.log('Decoded length:', privateKeyBytes.length);

if (privateKeyBytes.length !== 32) {
    throw new Error(`Invalid secret key size: ${privateKeyBytes.length} bytes`);
}

try {
    const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
    const address = keypair.getPublicKey().toSuiAddress();
    console.log('Address:', address);
} catch (error) {
    throw new Error(`Failed to derive keypair: ${error.message}`);
}
