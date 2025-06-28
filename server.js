import express from 'express';
import morgan from 'morgan';
import cors from 'cors'; // Add this line
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
import { createSuiAddressOffChain } from './callers/createSuiAddressOffChain.js';
import { createSuiAddressOnChain } from './callers/createSuiAddressOnChain.js';
import { createWallet } from './callers/createWallet.js';
import { fundSuiAddress } from './callers/fundSuiAddress.js';
import { transferToWallet } from './callers/transferToWallet.js';
import { depositToWallet } from './callers/depositToWallet.js';
import { transferToAddress } from './callers/transferToAddress.js';
import { expendReward } from './callers/expendReward.js';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const users = [];

app.use(morgan('dev'));
app.use(cors({
    origin: [
        'http://localhost:3000',                // Add this line for your frontend
        'http://localhost:3001',                 // Backend itself (if needed)
        'http://127.0.0.1:8080',                // Frontend local (IP)
        'http://localhost:8080',                // Frontend local (hostname)
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
    optionsSuccessStatus: 204
}));

app.use(express.json());
app.use('/frontend', express.static(path.join(__dirname, 'frontend')));

const SENDER_PRIVATE_KEY = process.env.PRIVATE_KEY;
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(CLIENT_ID);

if (!CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID must be set in .env');
}

console.log('Starting Tappr SmartContract Node.js Integration server...');



function deriveZkLoginAddress(sub, iss) {
    return '0x' + crypto.createHash('sha256').update(sub + iss).digest('hex').slice(0, 64);
}

app.post('/api/generate-wallet', async (req, res) => {
    const { jwt, username } = req.body;

    if (!jwt || !username) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: jwt or username'
        });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: jwt,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();

        const sub = payload['sub'];
        const iss = payload['iss'];

        if (!sub || !iss) {
            throw new Error('Invalid JWT payload');
        }

        const derivedAddress = deriveZkLoginAddress(sub, iss);
        const result = await createSuiAddressOnChain(derivedAddress);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to create wallet'
            });
        }

        res.status(200).json({
            success: true,
            walletObjectId: result.walletObjectId,
            walletAddress: result.walletAddress,
            transactionDigest: result.transactionDigest,
            senderAddress: result.senderAddress,
            messageForUser: `Wallet created for ${username} with address ${derivedAddress}`
        });
    } catch (error) {
        console.error('Error in /generate-wallet:', error);
        res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
});


app.post('/api/login', async (req, res) => {
    const { username, jwt } = req.body;

    if (!username || !jwt) {
        return res.status(400).json({ error: 'Missing username or JWT' });
    }

    try {
        const ticket = await client.verifyIdToken({
            idToken: jwt,
            audience: CLIENT_ID,
        });
        const payload = ticket.getPayload();

        const sub = payload['sub'];
        const iss = payload['iss'];

        if (!sub || !iss) {
            return res.status(400).json({ error: 'Invalid JWT payload' });
        }

        const suiAddress = deriveZkLoginAddress(sub, iss);

        res.json({
            username,
            suiAddress,
        });
    } catch (error) {
        console.error('Login error:', error.message);
        return res.status(401).json({ error: 'JWT verification failed' });
    }
});


app.post('/api/register', async (req, res) => {
    const { username, password, token } = req.body;

    if (token) {
        try {
            const decoded = await new Promise((resolve, reject) => {
                jwt.verify(token, process.env.JWT_SECRET_KEY, { algorithms: ['HS256'] }, (err, decoded) => {
                    if (err) reject(new Error('Invalid JWT'));
                    resolve(decoded);
                });
            });
        } catch (error) {
            return res.status(401).json({ success: false, error: 'Invalid or expired token' });
        }
    }

    if (!username || !password) {
        return res.status(400).json({ success: false, error: 'Missing username or password' });
    }

    try {
        if (users.find(user => user.username === username)) {
            return res.status(400).json({ success: false, error: 'Username already exists' });
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const sub = crypto.randomBytes(16).toString('hex'); // Random unique ID
        const iss = 'Tappr-register'; // Static issuer for registration

        const suiAddress = deriveZkLoginAddress(sub, iss);

        const result = await createSuiAddressOnChain(suiAddress);
        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to create wallet on-chain'
            });
        }

        const payload = {
            sub, // Unique user ID
            iss, // Issuer
            username,
            iat: Math.floor(Date.now() / 1000), // Issued at timestamp
            exp: Math.floor(Date.now() / 1000) + 60 * 60 // Expires in 1 hour
        };

        const jwtToken = jwt.sign(payload, process.env.JWT_SECRET_KEY, { algorithm: 'HS256' });

        const user = {
            username,
            hashedPassword,
            suiAddress,
            walletObjectId: result.walletObjectId,
            sub,
            iss
        };
        users.push(user);

        res.status(201).json({
            success: true,
            username,
            suiAddress,
            walletObjectId: result.walletObjectId,
            transactionDigest: result.transactionDigest,
            senderAddress: result.senderAddress,
            token: jwtToken,
            message: `User ${username} registered successfully with address ${suiAddress} and wallet object ${result.walletObjectId}`
        });
    } catch (error) {
        console.error('Registration error:', {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({ success: false, error: 'Registration failed' });
    }
});


app.post('/api/create-sui-address-off-chain', (req, res) => {
    try {
        console.log('Received POST /api/create-sui-address_off-chain', {
            body: req.body,
            headers: req.headers,
        });

        const result = createSuiAddressOffChain();
        if (!result || !result.walletAddress || !result.privateKey) {
            throw new Error('Invalid response from createSuiAddress: missing walletAddress or privateKey');
        }

        console.log('createSuiAddress result:', result);

        res.json({
            success: true,
            walletAddress: result.walletAddress,
            privateKey: result.privateKey,
            messageForUser: 'Wallet created off-chain. Fund it with SUI tokens to use it on-chain.',
        });
    } catch (error) {
        console.error('Error in /api/create-sui-address-off-chain', {
            message: error.message,
            stack: error.stack,
        });
        res.status(500).json({
            success: false,
            error: error.message,
            requestId: req.headers['x-request-id'] || 'unknown',
        });
    }
});


app.post('/api/create-sui-address-on-chain', async (req, res) => {
    try {
        console.log('Creating Sui address on-chain...');
        const result = await createSuiAddressOnChain(req.body.derivedAddress); // Optionally accept derivedAddress

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.status(200).json({
            success: true,
            walletObjectId: result.walletObjectId,
            walletAddress: result.walletAddress,
            transactionDigest: result.transactionDigest,
            senderAddress: result.senderAddress,
            messageForUser: 'Wallet created on-chain with provided address as owner.',
        });
    } catch (error) {
        console.error('Error in /api/create-sui-address-on-chain', error);
        res.status(500).json({ success: false, error: `Server error: ${error.message}` });
    }
});


app.post('/api/fund-sui-address', async (req, res) => {
    try {
        const { senderPrivateKey, recipientWalletId, amount } = req.body;

        if (!recipientWalletId || !recipientWalletId.match(/^0x[0-9a-fA-F]{64}$/)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing recipient wallet address: must be a 66-character hex string starting with 0x',
            });
        }
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing amount: must be a positive number in SUI',
            });
        }

        console.log(`Processing fund request: ${amount} SUI to ${recipientWalletId}`);

        const result = await fundSuiAddress({
            senderPrivateKey,
            recipientWalletId,
            amount,
        });

        if (!result.success) {
            return res.status(400).json(result);
        }

        res.status(200).json({
            success: true,
            transactionDigest: result.transactionDigest,
            senderAddress: result.senderAddress,
            amountInSui: result.amountInSui,
            amountInMist: result.amountInMist,
            message: result.message,
        });
    } catch (error) {
        console.error('Error in /api/fund-sui-address:', error);
        res.status(500).json({
            success: false,
            error: `Funding failed: ${error.message}`,
        });
    }
});


app.post('/api/create-wallet', async (req, res) => {
    try {
        const { address, privateKey } = req.body || {};

        const result = await createWallet({
            address,
            privateKey,
        });

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error || 'Failed to create Wallet',
            });
        }

        res.json({
            success: true,
            walletObjectId: result.walletObjectId,
            transactionDigest: result.transactionDigest,
            address: result.address,
            messageForUser: `Successfully created Wallet object ${result.walletObjectId} for address ${result.address}`,
        });
    } catch (error) {
        console.error('Create Wallet error:', error);
        res.status(500).json({
            success: false,
            error: `Failed to create Wallet: ${error.message}`,
        });
    }
});


app.post('/api/deposit-to-wallet', async (req, res) => {
    try {
        const depositParams = {
            senderPrivateKey: process.env.PRIVATE_KEY,
            walletId: "0x03355332cb05eb346e8b71de30c374726bb703f00c15582b598e11a01693009e",
            amountInMist: 30_000_000
        };

        const result = await depositToWallet(depositParams);

        if (result.success) {
            res.status(200).json({
                success: true,
                transactionDigest: result.transactionDigest,
                senderAddress: result.senderAddress
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Deposit API error:', error.stack);
        res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
});


app.post('/api/transfer-to-wallet', async (req, res) => {
    try {
        const transferParams = {
            senderPrivateKey: process.env.PRIVATE_KEY,
            sourceWalletId: "0x03355332cb05eb346e8b71de30c374726bb703f00c15582b598e11a01693009e",
            destWalletId: "0xb38b6ca8dd130ee6938a20a4cccbcb33c62c693c012eb3b2de951a5cf5006012",
            recipientAddress: "0x52f03ac4ac477f9ec51f0e51b9a6d720a311e3a8c0c11cd8c2eeb9eb44d475e5",
            amount: 0.007
        };

        const result = await transferToWallet(transferParams);

        if (result.success) {
            res.status(200).json({
                success: true,
                transactionDigest: result.transactionDigest,
                senderAddress: result.senderAddress
            });
        } else {
            res.status(400).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('Transfer API error:', error.stack);
        res.status(500).json({
            success: false,
            error: `Server error: ${error.message}`
        });
    }
});


app.post('/api/transfer-to-address', async (req, res) => {
    try {
        const recipientAddress = "0x28b7cefa1e46d3e6d695a0f465b72033279e076bb7240c7715ec5950e9004e08";
        const amount = 0.007;

        if (!recipientAddress || !recipientAddress.startsWith('0x')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing recipient wallet address'
            });
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing amount'
            });
        }

        const amountInMist = Math.floor(parseFloat(amount) * 1_000_000_000);

        const result = await transferToAddress({
            senderPrivateKey: SENDER_PRIVATE_KEY,
            recipientAddress,
            amount: amountInMist
        });

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error || 'Transaction failed'
            });
        }

        res.status(200).json({
            success: true,
            transactionDigest: result.transactionDigest,
            messageForUser: `Successfully transferred ${amount} SUI to ${recipientAddress}`
        });
    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({
            success: false,
            error: `Transfer failed: ${error.message}`
        });
    }
});


app.post('/api/expend-reward', async (req, res) => {
    try {
        const recipientWalletId = "0xb7cd2f1248678984499a78ee51e14a01d1a9efe4d23f11469c3c29a11e4fdf6f";
        const amount = 0.012;

        if (!recipientWalletId || !recipientWalletId.startsWith('0x')) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing recipient wallet address'
            });
        }
        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or missing amount'
            });
        }
        if (!SENDER_PRIVATE_KEY) {
            return res.status(400).json({
                success: false,
                error: 'Sender private key not provided'
            });
        }

        let privateKey = SENDER_PRIVATE_KEY;
        if (privateKey.startsWith('0x')) {
            privateKey = privateKey.slice(2);
        }
        if (privateKey.length !== 64) {
            return res.status(400).json({
                success: false,
                error: `Invalid private key length: ${privateKey.length} characters (expected 64)`
            });
        }

        let privateKeyBytes;
        try {
            privateKeyBytes = Buffer.from(privateKey, 'hex');
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: `Invalid hex string in private key: ${error.message}`
            });
        }
        if (privateKeyBytes.length !== 32) {
            return res.status(400).json({
                success: false,
                error: `Invalid private key byte length: ${privateKeyBytes.length} bytes (expected 32)`
            });
        }

        let senderAddress;
        try {
            const keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
            senderAddress = keypair.getPublicKey().toSuiAddress();
            console.log(`Derived sender address: ${senderAddress}`);
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: `Failed to derive sender address: ${error.message}`
            });
        }

        const amountInMist = Math.floor(parseFloat(amount) * 1_000_000_000);

        const result = await expendReward({
            SENDER_PRIVATE_KEY: privateKeyBytes,
            senderAddress,
            recipientWalletId,
            amount: amountInMist
        });

        if (!result.success) {
            return res.status(500).json(result);
        }

        res.json({
            success: true,
            transactionDigest: result.transactionDigest,
            messageForUser: `Successfully funded ${amount} SUI from ${senderAddress} to ${recipientWalletId}`
        });
    } catch (error) {
        console.error('Funding error:', error);
        res.status(500).json({
            success: false,
            error: `Funding failed: ${error.message}`
        });
    }
});



const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});


app.use((err, req, res, next) => {
    console.error('Unhandled error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        requestId: req.headers['x-request-id'] || 'unknown',
    });
});


