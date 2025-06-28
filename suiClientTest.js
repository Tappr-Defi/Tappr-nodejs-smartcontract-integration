import { client } from './suiClient.js';

async function testConnection() {
    const chainId = await client.getChainIdentifier();
    console.log('Connected to chain:', chainId);
}

testConnection().catch(console.error);
