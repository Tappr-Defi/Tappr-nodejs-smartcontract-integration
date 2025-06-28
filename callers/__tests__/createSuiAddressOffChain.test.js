import { createSuiAddressOffChain } from '../createSuiAddressOffChain.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';

describe('createSuiAddressOffChain', () => {

    test('should return a valid wallet address and private key', () => {
        const result = createSuiAddressOffChain();

        expect(result).toBeDefined();
        expect(result).toHaveProperty('walletAddress');
        expect(result).toHaveProperty('privateKey');

        expect(typeof result.walletAddress).toBe('string');
        expect(result.walletAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);
        expect(result.walletAddress.length).toBe(66);

        expect(typeof result.privateKey).toBe('string');
        expect(result.privateKey).toMatch(/^[0-9a-fA-F]+$/);
        expect(result.privateKey.length).toBe(64);

        const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(result.privateKey, 'hex'));
        const derivedAddress = keypair.getPublicKey().toSuiAddress();
        expect(derivedAddress).toBe(result.walletAddress);
    });


    test('should generate different addresses on multiple calls', () => {
        const result1 = createSuiAddressOffChain();
        const result2 = createSuiAddressOffChain();

        expect(result1.walletAddress).not.toBe(result2.walletAddress);
        expect(result1.privateKey).not.toBe(result2.privateKey);
    });
});
