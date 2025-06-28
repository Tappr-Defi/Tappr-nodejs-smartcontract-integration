import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new SuiClient({
    url: getFullnodeUrl('testnet'),
});

const privateKey = fromHex(process.env.PRIVATE_KEY);
const keypair = Ed25519Keypair.fromSecretKey(privateKey);

export { client, keypair };
