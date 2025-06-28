import { TransactionBlock } from '@mysten/sui.js/transactions';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { client } from '../suiClient.js';

const PACKAGE_ID = process.env.PACKAGE_ID;
const MODULE_NAME = process.env.MODULE_NAME;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FIXED_GAS_BUDGET = 100_000_000;


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

async function executeTransaction(txb, keypair) {
    try {
        const result = await client.signAndExecuteTransactionBlock({
            transactionBlock: txb,
            signer: keypair,
            options: {
                showEffects: true,
                showEvents: true,
            },
        });
        console.log('Transaction result:', JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error('Transaction failed:', error.stack);
        throw error;
    }
}

async function checkBalance(walletAddress) {
    try {
        const balance = await client.getBalance({
            owner: walletAddress,
            coinType: '0x2::sui::SUI',
        });
        return parseInt(balance.totalBalance);
    } catch (error) {
        console.error(`Failed to check balance for ${walletAddress}:`, error);
        throw error;
    }
}

async function verifyWalletObject(objectId, ownerAddress) {
    try {
        const object = await client.getObject({
            id: objectId,
            options: { showType: true, showOwner: true, showContent: true },
        });
        if (!object.data) {
            throw new Error(`Wallet object ${objectId} not found`);
        }
        if (object.data.type !== `${PACKAGE_ID}::${MODULE_NAME}::Wallet`) {
            throw new Error(`Object ${objectId} is not a Wallet object, got type ${object.data.type}`);
        }
        if (object.data.owner?.AddressOwner !== ownerAddress) {
            throw new Error(`Wallet object ${objectId} is not owned by ${ownerAddress}`);
        }
        console.log(`Verified Wallet object ${objectId} for owner ${ownerAddress}`);
        return object.data.content;
    } catch (error) {
        console.error(`Failed to verify wallet object ${objectId}:`, error);
        throw error;
    }
}

async function checkWalletBalance(walletObjectId) {
    try {
        const object = await client.getObject({
            id: walletObjectId,
            options: { showContent: true },
        });
        if (!object.data || !object.data.content) {
            throw new Error(`Wallet object ${walletObjectId} not found`);
        }
        const content = object.data.content;
        if (content.dataType !== 'moveObject') {
            throw new Error(`Object ${walletObjectId} is not a Move object`);
        }
        const balanceValue = content.fields.balance?.fields?.balance;
        if (!balanceValue || isNaN(parseInt(balanceValue))) {
            throw new Error(`Invalid balance for wallet ${walletObjectId}: ${JSON.stringify(content.fields.balance)}`);
        }
        const balance = parseInt(balanceValue);
        console.log(`Wallet ${walletObjectId} balance: ${balance} MIST`);
        return balance;
    } catch (error) {
        console.error(`Failed to check balance for wallet ${walletObjectId}:`, error);
        throw error;
    }
}



export async function transferToWallet({
           senderPrivateKey = PRIVATE_KEY,
           sourceWalletId = "0x03355332cb05eb346e8b71de30c374726bb703f00c15582b598e11a01693009e",
           destWalletId = "0xb38b6ca8dd130ee6938a20a4cccbcb33c62c693c012eb3b2de951a5cf5006012",
           recipientAddress = "0x52f03ac4ac477f9ec51f0e51b9a6d720a311e3a8c0c11cd8c2eeb9eb44d475e5",
           amount = 0.007 // Amount in SUI
       }) {
    try {
        if (!senderPrivateKey) {
            throw new Error('Sender private key is required');
        }
        if (!sourceWalletId || !sourceWalletId.startsWith('0x')) {
            throw new Error('Invalid source wallet object ID');
        }
        if (!destWalletId || !destWalletId.startsWith('0x')) {
            throw new Error('Invalid destination wallet object ID');
        }
        if (!recipientAddress || !recipientAddress.startsWith('0x')) {
            throw new Error('Recipient address is required');
        }
        if (!amount || amount <= 0) {
            throw new Error('Invalid transfer amount');
        }

        let amountInMist = amount;
        if (!Number.isInteger(amount)) {
            console.log(`Converting amount ${amount} SUI to MIST`);
            amountInMist = Math.floor(amount * 1_000_000_000); // Convert SUI to MIST
            if (!Number.isSafeInteger(amountInMist)) {
                throw new Error(`Amount ${amount} SUI results in unsafe integer ${amountInMist} MIST`);
            }
        }
        console.log(`Using amount: ${amountInMist} MIST`);

        if (!Number.isInteger(amountInMist)) {
            throw new Error(`Amount must be an integer in MIST, got ${amountInMist}`);
        }

        const senderKeypair = getKeypairFromPrivateKey(senderPrivateKey);
        const derivedSenderAddress = senderKeypair.getPublicKey().toSuiAddress();

        const senderAddress = "0x52f03ac4ac477f9ec51f0e51b9a6d720a311e3a8c0c11cd8c2eeb9eb44d475e5";

        if (senderAddress !== derivedSenderAddress) {
            throw new Error('Hardcoded sender address does not match private key');
        }

        await verifyWalletObject(sourceWalletId, senderAddress);
        await verifyWalletObject(destWalletId, recipientAddress);

        const sourceBalance = await checkWalletBalance(sourceWalletId);
        if (sourceBalance < amountInMist) {
            throw new Error(`Insufficient wallet balance: ${sourceBalance} MIST available, ${amountInMist} MIST required`);
        }

        const addressBalance = await checkBalance(senderAddress);
        console.log(`Sender address balance: ${addressBalance} MIST`);
        const gasCoins = await client.getCoins({
            owner: senderAddress,
            coinType: '0x2::sui::SUI',
        });
        const gasCoin = gasCoins.data.find((coin) => parseInt(coin.balance) >= FIXED_GAS_BUDGET);
        if (!gasCoin) {
            throw new Error(`No suitable gas coin found: ${addressBalance} MIST available, ${FIXED_GAS_BUDGET} MIST required`);
        }
        console.log(`Using gas coin ${gasCoin.coinObjectId} with balance ${gasCoin.balance} MIST`);



        const txb = new TransactionBlock();
        txb.setSender(senderAddress);
        txb.moveCall({
            target: `${PACKAGE_ID}::${MODULE_NAME}::transfer_to_wallet`,
            arguments: [
                txb.object(sourceWalletId),
                txb.object(destWalletId),
                txb.pure.u64(amountInMist),
            ],
        });

        txb.setGasPayment([{ objectId: gasCoin.coinObjectId, version: gasCoin.version, digest: gasCoin.digest }]);
        txb.setGasBudget(FIXED_GAS_BUDGET);

        console.log(`Transferring ${amountInMist} MIST from wallet ${sourceWalletId} to wallet ${destWalletId}...`);
        const result = await executeTransaction(txb, senderKeypair);

        const sourceBalanceAfter = await checkWalletBalance(sourceWalletId);
        const destBalanceAfter = await checkWalletBalance(destWalletId);
        console.log(`Post-transfer: Source wallet ${sourceWalletId} balance: ${sourceBalanceAfter} MIST`);
        console.log(`Post-transfer: Destination wallet ${destWalletId} balance: ${destBalanceAfter} MIST`);

        return {
            success: true,
            transactionDigest: result.digest,
            senderAddress,
            sourceBalanceAfter,
            destBalanceAfter
        };
    } catch (error) {
        console.error('Transfer failed:', error.stack);
        return { success: false, error: `Transfer failed: ${error.message}` };
    }
}

export async function getSenderAddress(senderPrivateKey) {
    try {
        const keypair = getKeypairFromPrivateKey(senderPrivateKey);
        return keypair.getPublicKey().toSuiAddress();
    } catch (error) {
        console.error('Failed to derive sender address:', error);
        throw new Error('Invalid private key');
    }
}



