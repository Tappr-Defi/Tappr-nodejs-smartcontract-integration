import { jest } from '@jest/globals';


jest.unstable_mockModule('../../suiClient.js', () => ({
    client: {
        getBalance: jest.fn(),
        signAndExecuteTransactionBlock: jest.fn(),
    },
}));

const { createSuiAddressOnChain } = await import('../createSuiAddressOnChain.js');
const { client } = await import('../../suiClient.js');
const { Ed25519Keypair } = await import('@mysten/sui.js/keypairs/ed25519');

describe('createSuiAddressOnChain', () => {
    const originalEnv = process.env;
    const mockPackageId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const mockModuleName = 'wallet_module';
    const mockPrivateKey = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2';
    const fixedGasBudget = 100_000_000;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = originalEnv;
        console.log.mockRestore();
        console.error.mockRestore();
    });

    test('should create a wallet on-chain successfully', async () => {
        client.getBalance.mockImplementation(() => Promise.resolve({ totalBalance: '200000000' })); // 0.2 SUI in MIST
        client.signAndExecuteTransactionBlock.mockImplementation(() =>
            Promise.resolve({
                digest: 'mockTransactionDigest',
                effects: {
                    status: { status: 'success' },
                    created: [{ reference: { objectId: 'mockWalletObjectId' } }],
                },
                events: [
                    {
                        type: `${mockPackageId}::${mockModuleName}::WalletCreatedEvent`,
                        parsedJson: {
                            wallet_id: '0xmockWalletAddress1234567890abcdef1234567890abcdef1234567890abcdef',
                            owner: '0xmockWalletAddress1234567890abcdef1234567890abcdef1234567890abcdef',
                        },
                    },
                ],
            })
        );

        const result = await createSuiAddressOnChain();

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result).toHaveProperty('walletObjectId', 'mockWalletObjectId');
        expect(result).toHaveProperty('walletAddress', '0xmockWalletAddress1234567890abcdef1234567890abcdef1234567890abcdef');
        expect(result).toHaveProperty('privateKey');
        expect(result).toHaveProperty('transactionDigest', 'mockTransactionDigest');
        expect(result).toHaveProperty('senderAddress');

        expect(typeof result.walletAddress).toBe('string');
        expect(result.walletAddress).toMatch(/^0x[0-9a-fA-F]{64}$/);
        expect(result.walletAddress.length).toBe(66);

        expect(typeof result.privateKey).toBe('string');
        expect(result.privateKey).toMatch(/^[0-9a-fA-F]+$/);
        expect(result.privateKey.length).toBe(64);

        const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(result.privateKey, 'hex'));
        const derivedAddress = keypair.getPublicKey().toSuiAddress();
        expect(derivedAddress).toBe(result.walletAddress);

        expect(client.getBalance).toHaveBeenCalledWith({ owner: expect.any(String) });
        expect(client.signAndExecuteTransactionBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                transactionBlock: expect.any(Object),
                signer: expect.any(Object),
                options: { showEffects: true, showEvents: true, showObjects: true },
            })
        );

        expect(console.log).toHaveBeenCalledWith(`Sender address (for gas): ${result.senderAddress}`);
        expect(console.log).toHaveBeenCalledWith(`New wallet address: ${result.walletAddress}`);
        expect(console.log).toHaveBeenCalledWith(`Sender total balance: ${200000000} MIST`);
        expect(console.log).toHaveBeenCalledWith(
            `Wallet created with object ID: ${result.walletObjectId}, address: ${result.walletAddress}, owner: ${result.walletAddress}`
        );
    });

    test('should fail if PRIVATE_KEY is missing', async () => {
        delete process.env.PRIVATE_KEY;

        const result = await createSuiAddressOnChain();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to create Wallet: Private key is required in .env to sign the transaction.');
        expect(console.error).toHaveBeenCalledWith(
            'Failed to create Wallet for unknown address:',
            expect.any(Error)
        );
    });

    test('should fail if balance is insufficient', async () => {
        process.env.PRIVATE_KEY = mockPrivateKey;
        client.getBalance.mockImplementation(() => Promise.resolve({ totalBalance: '50000000' })); // 0.05 SUI

        const result = await createSuiAddressOnChain();

        expect(result.success).toBe(false);
        expect(result.error).toBe(`Failed to create Wallet: Insufficient balance for gas (${fixedGasBudget} MIST). Current balance: 50000000 MIST`);
        expect(console.error).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Error)
        );
    });

    test('should fail if private key is invalid length', async () => {
        process.env.PRIVATE_KEY = 'a1b2c3d4';

        const result = await createSuiAddressOnChain();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to create Wallet: Invalid private key length: 8 characters (expected 64)');
        expect(console.error).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Error)
        );
    });
});
