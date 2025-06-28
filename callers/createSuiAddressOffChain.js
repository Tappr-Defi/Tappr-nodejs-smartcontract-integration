import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui.js/cryptography';


export function createSuiAddressOffChain() {
    const keypair = Ed25519Keypair.generate();

    const walletAddress = keypair.getPublicKey().toSuiAddress();

    const bech32PrivateKey = keypair.getSecretKey();
    const { secretKey } = decodeSuiPrivateKey(bech32PrivateKey);
    const privateKeyHex = Buffer.from(secretKey).toString('hex');

    return {
        walletAddress,
        privateKey: privateKeyHex,
    };
}

