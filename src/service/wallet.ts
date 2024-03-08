import { createId } from "@paralleldrive/cuid2";
import { createTransferInstruction, getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import {
	type AccountInfo,
	ComputeBudgetProgram,
	Keypair,
	type ParsedAccountData,
	PublicKey,
	type RpcResponseAndContext,
	sendAndConfirmTransaction,
	Transaction as SolanaTransaction
} from "@solana/web3.js";
import base58 from "bs58";
import { ethers } from "ethers";
import type { Sql, TransactionSql } from "postgres";
import nacl from "tweetnacl";
import { z } from "zod";
import { db, rpcProviders } from "../config";
import { redis } from "../config/db.ts";
import type { TransactionPaginatedResponse } from "../schema/wallet/object.ts";
import { ErrorUtil } from "../util";
import { UserService, WalletService } from "./index.ts";

const { EVM_PRIVATE_KEY, SOLANA_PRIVATE_KEY } = Bun.env;

if (!EVM_PRIVATE_KEY || !SOLANA_PRIVATE_KEY) throw new Error("Environment variables EVM_PRIVATE_KEY or SOLANA_PRIVATE_KEY must be set.");

const evmWallet = new ethers.Wallet(EVM_PRIVATE_KEY);
const solanaWallet = Keypair.fromSecretKey(base58.decode(SOLANA_PRIVATE_KEY));

const Token = z.enum(["gone", "toshi", "myro", "eth"]);
type Token = z.infer<typeof Token>;

const Chain = z.enum(["polygon", "base", "solana", "polygon_zkevm"]);
type Chain = z.infer<typeof Chain>;

const ChainType = z.enum(["evm", "solana"]);
type ChainType = z.infer<typeof ChainType>;

const TransactionStatus = z.enum(["pending", "completed"]);
type TransactionStatus = z.infer<typeof TransactionStatus>;

const TransactionFor = z.enum(["bet", "bet_cancel", "bet_win", "withdraw", "deposit"]);
type TransactionFor = z.infer<typeof TransactionFor>;

const Transaction = z.object({
	id: z.string().default(() => createId()),
	userId: z.string(),
	amount: z.coerce.number(),
	rewardAmount: z.coerce.number(),
	txFor: TransactionFor,
	txStatus: TransactionStatus,
	txHash: z.string().nullable().default(null),
	token: Token,
	chain: Chain,
	betId: z.string().nullable().default(null),
	betQuantity: z.number().nullable().default(null),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date())
});
type Transaction = z.infer<typeof Transaction>;

const LinkedWallet = z.object({
	id: z.string(),
	userId: z.string(),
	chainType: ChainType,
	address: z.string(),
	createdAt: z.date()
});
type LinkedWallet = z.infer<typeof LinkedWallet>;

const Balance = z.object({
	rewardBalance: z.coerce.number(),
	totalBalance: z.coerce.number(),
	userId: z.string(),
	token: Token,
	chain: Chain
});
type Balance = z.infer<typeof Balance>;

/**
 * TokenCombination is a constant array that represents the different types of tokens available in the system.
 * Each token is represented as an object with the following properties:
 * - token: The name of the token.
 * - chain: The blockchain where the token resides.
 * - address: The contract address of the token on its respective blockchain.
 * - decimals: The number of decimal places the token uses. This is important for correctly calculating token amounts.
 */
const TokenCombination = [
	{
		token: "gone",
		chain: "polygon",
		address: "0x162539172b53E9a93b7d98Fb6c41682De558a320",
		decimals: 18
	},
	{
		token: "toshi",
		chain: "base",
		address: "0x8544FE9D190fD7EC52860abBf45088E81Ee24a8c",
		decimals: 18
	},
	{
		token: "myro",
		chain: "solana",
		address: "HhJpBhRRn4g56VsyLuT8DL5Bv31HkXqsrahTTUCZeZg4",
		decimals: 9
	},
	{
		token: "eth",
		chain: "polygon_zkevm",
		address: "0x0",
		decimals: 18
	}
] as const;

/**
 * The ABI (Application Binary Interface) for the ERC20 token transfer function & event.
 * This is used to interact with the Ethereum blockchain and specifically with ERC20 tokens.
 */
const erc20TransferEventAbi = [
	{
		anonymous: false,
		inputs: [
			{ indexed: true, internalType: "address", name: "from", type: "address" },
			{ indexed: true, internalType: "address", name: "to", type: "address" },
			{ indexed: false, internalType: "uint256", name: "value", type: "uint256" }
		],
		name: "Transfer",
		type: "event"
	},
	{
		inputs: [
			{ internalType: "address", name: "to", type: "address" },
			{
				internalType: "uint256",
				name: "amount",
				type: "uint256"
			}
		],
		name: "transfer",
		outputs: [{ internalType: "bool", name: "", type: "bool" }],
		stateMutability: "nonpayable",
		type: "function"
	}
];

/**
 * Generates a transaction payload for SQL based on the provided parameters.
 * This payload can be used to create a new transaction in the database.
 *
 * @param {string} userId - The ID of the user who is making the transaction.
 * @param {TransactionFor} txFor - The purpose of the transaction (e.g., "bet", "withdraw", "deposit").
 * @param {number} amount - The amount of the transaction.
 * @param {number} rewardAmount - The reward amount of the transaction.
 * @param {Token} token - The token involved in the transaction.
 * @param {Chain} chain - The chain where the transaction is happening.
 * @param {string | null} [txHash=null] - The hash of the transaction. Defaults to null.
 * @param {TransactionStatus} [txStatus="completed"] - The status of the transaction. Defaults to "completed".
 * @param {string | null} [betId=null] - The ID of the bet associated with the transaction. Defaults to null.
 * @param {number | null} [betQuantity=null] - The quantity of the bet associated with the transaction. Defaults to null.
 *
 * @returns {Transaction} - The generated transaction payload.
 */
const generateTxSqlPayload = (
	userId: string,
	txFor: TransactionFor,
	amount: number,
	rewardAmount: number,
	token: Token,
	chain: Chain,
	txHash: string | null = null,
	txStatus: TransactionStatus = "completed",
	betId: string | null = null,
	betQuantity: number | null = null
): Transaction => {
	const payload = {
		id: createId(),
		userId,
		txFor,
		amount,
		rewardAmount,
		token,
		chain,
		betId,
		betQuantity,
		txHash,
		txStatus
	};

	return Transaction.parse(payload);
};

/**
 * Retrieves the balance of a specific token for a user from the database.
 * The balance is divided into reward balance and total balance.
 *
 * @async
 * @function getUserTokenBalance
 * @param {TransactionSql | Sql} sql - The SQL query function.
 * @param {string} userId - The ID of the user whose balance is to be retrieved.
 * @param {Token} token - The token whose balance is to be retrieved.
 * @param {Chain} chain - The chain where the token resides.
 * @returns {Promise<{ rewardBalance: number; totalBalance: number; }>} - A promise that resolves to an object containing the reward balance and total balance of the user for the specified token.
 */
const getUserTokenBalance = async (
	sql: TransactionSql | Sql,
	userId: string,
	token: Token,
	chain: Chain
): Promise<{
	rewardBalance: number;
	totalBalance: number;
}> => {
	const [res] = (await sql`
      SELECT SUM(reward_amount)          as reward_balance,
             SUM(amount + reward_amount) AS total_balance
      FROM "wallet".transaction
      WHERE user_id = ${userId}
        AND token = ${token}
        AND chain = ${chain}
	`) as [
		{
			rewardBalance: string | null;
			totalBalance: string | null;
		}
	];

	if (!res) {
		return {
			rewardBalance: 0,
			totalBalance: 0
		};
	}

	const { rewardBalance, totalBalance } = res;

	return {
		rewardBalance: Number(rewardBalance),
		totalBalance: Number(totalBalance)
	};
};

/**
 * Retrieves the balance of all tokens for a specific user from the database.
 * The balance is divided into reward balance and total balance for each token.
 *
 * @async
 * @function getUserBalance
 * @param {string} userId - The ID of the user whose balance is to be retrieved.
 * @returns {Promise<Balance[]>} - A promise that resolves to an array of balance objects for the specified user. Each balance object contains the reward balance, total balance, user id, token, and chain.
 */
const getUserBalance = async (userId: string): Promise<Balance[]> => {
	const res = (await db.sql`
      SELECT SUM(reward_amount)          as reward_balance,
             SUM(amount + reward_amount) AS total_balance,
             ${userId}                   AS user_id,
             token,
             chain
      FROM "wallet".transaction
      WHERE user_id = ${userId}
      GROUP BY token, chain
	`) as [
		{
			rewardBalance: string | null;
			totalBalance: string | null;
			userId: string;
			token: Token;
			chain: Chain;
		}
	];

	WalletService.TokenCombination.forEach((item) => {
		if (!res.find((i) => i.token === item.token && i.chain === item.chain)) {
			res.push({
				rewardBalance: "0",
				totalBalance: "0",
				userId,
				token: item.token,
				chain: item.chain
			});
		}
	});

	return z.array(Balance).parse(res);
};

/**
 * This function retrieves a list of transactions from the database based on the provided filters and pagination parameters.
 * The function supports filtering by user ID, token, and chain.
 * The function also supports pagination through the page and limit parameters.
 * The function returns a paginated response containing the filtered transactions and the total count of transactions that match the filters.
 *
 * @async
 * @function getTransactions
 * @param {string} userId - The ID of the user whose transactions are to be retrieved.
 * @param {Token | null} token - The token to filter the transactions by. If null, no token filter is applied.
 * @param {Chain | null} chain - The chain to filter the transactions by. If null, no chain filter is applied.
 * @param {number} page - The page number for pagination. The first page is 0.
 * @param {number} limit - The number of transactions to return per page.
 * @returns {Promise<TransactionPaginatedResponse>} - Returns a promise that resolves to a paginated response containing the filtered transactions and the total count of transactions that match the filters.
 * @throws {ErrorUtil.HttpException} - If the token and chain combination is invalid.
 */
const getTransactions = async (userId: string, token: Token | null = null, chain: Chain | null = null, page: number, limit: number): Promise<TransactionPaginatedResponse> => {
	if ((token || chain) && !TokenCombination.some((item) => item.token === token && item.chain === chain)) throw new ErrorUtil.HttpException(400, "Invalid token and chain combination.");

	const transactions = db.sql`
      SELECT *
      FROM "wallet".transaction
      WHERE user_id = ${userId}
          ${token ? db.sql`AND token = ${token}` : db.sql``}
          ${chain ? db.sql`AND chain = ${chain}` : db.sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${page * limit}
	`;
	const total = db.sql`
      SELECT COUNT(*)
      FROM "wallet".transaction
      WHERE user_id = ${userId}
          ${token ? db.sql`AND token = ${token}` : db.sql``}
          ${chain ? db.sql`AND chain = ${chain}` : db.sql``}
	` as Promise<[{ count: string }]>;

	const [transactionsRes, [totalRes]] = await Promise.all([transactions, total]);

	return {
		transactions: z.array(Transaction).parse(transactionsRes),
		total: Number(totalRes.count),
		page: page + 1,
		limit
	};
};

/**
 * Retrieves a transaction from the database based on the provided transaction hash and chain.
 * If no transaction is found, it returns null.
 *
 * @async
 * @function getTransactionByHash
 * @param {string} hash - The hash of the transaction to be retrieved.
 * @param {Chain} chain - The chain where the transaction resides.
 * @returns {Promise<Transaction | null>} - A promise that resolves to the transaction if found, or null if not found.
 */
const getTransactionByHash = async (hash: string, chain: Chain): Promise<Transaction | null> => {
	const [transaction] = await db.sql`SELECT *
                                     FROM "wallet".transaction
                                     WHERE tx_hash = ${hash}
                                       and chain = ${chain}`;
	if (!transaction) return null;

	console.log(transaction);

	return Transaction.parse(transaction);
};

/**
 * Generates a signing message for a user to link their wallet to their account.
 * The message includes a nonce and is stored in Redis with an expiration time of 5 minutes.
 *
 * @async
 * @function getSigningMessage
 * @param {string} userId - The ID of the user who is requesting the signing message.
 * @param {ChainType} chain - The type of the chain where the user's wallet resides.
 * @returns {Promise<{ message: string; nonce: string; }>} - A promise that resolves to an object containing the generated signing message and the nonce.
 */
const getSigningMessage = async (userId: string, chain: ChainType): Promise<{ message: string; nonce: string }> => {
	const nonce = createId();
	const message = `Sign this message to link your wallet to your account. This message will expire in 5 minutes. Nonce: ${nonce}`;
	await redis.set(`signing_message:${userId}:${chain}:${nonce}`, message, "EX", 300);
	return {
		message,
		nonce
	};
};

/**
 * Retrieves a linked wallet from the database based on the provided wallet address.
 * If no linked wallet is found, it returns null.
 *
 * @async
 * @function getLinkedWalletByAddress
 * @param {string} address - The address of the wallet to be retrieved.
 * @returns {Promise<LinkedWallet | null>} - A promise that resolves to the linked wallet if found, or null if not found.
 */
const getLinkedWalletByAddress = async (address: string): Promise<LinkedWallet | null> => {
	const [linkedWallet] = await db.sql`SELECT *
                                      FROM "wallet".linked_wallet
                                      WHERE address = ${address}`;
	if (!linkedWallet) return null;
	return LinkedWallet.parse(linkedWallet);
};

/**
 * Verifies a signing message for a user to link their wallet to their account.
 * The function retrieves the signing message from Redis, verifies the signature, and links the wallet to the user's account.
 * If the signing message is not found, the function throws an error.
 * If the signature is invalid, the function throws an error.
 * If the wallet is already linked to another account or to the same account, the function throws an error.
 *
 * @async
 * @function verifyMessage
 * @param {string} userId - The ID of the user who is verifying the signing message.
 * @param {ChainType} chain - The type of the chain where the user's wallet resides.
 * @param {string} nonce - The nonce that was included in the signing message.
 * @param {string} wallet - The wallet used to sign the message.
 * @param {string} signature - The signature of the signing message.
 * @returns {Promise<LinkedWallet>} - A promise that resolves to the linked wallet if the verification is successful.
 * @throws {ErrorUtil.HttpException} - If the signing message is not found, if the signature is invalid, or if the wallet is already linked to another account or to the same account.
 */
const verifyMessage = async (userId: string, chain: ChainType, nonce: string, wallet: string, signature: string): Promise<LinkedWallet> => {
	const message = await redis.get(`signing_message:${userId}:${chain}:${nonce}`);
	if (!message) throw new ErrorUtil.HttpException(400, "Signing message not found or expired.");

	let signedWallet: string;

	if (chain === "evm") {
		signedWallet = ethers.verifyMessage(message, signature);
		if (signedWallet !== ethers.getAddress(wallet)) throw new ErrorUtil.HttpException(400, "Wallet address does not match signature.");
	} else {
		const publicKey = new PublicKey(wallet);
		const encodedMessage = new TextEncoder().encode(message);
		const walletIsSigner = nacl.sign.detached.verify(encodedMessage, base58.decode(signature), publicKey.toBuffer());
		if (!walletIsSigner) throw new ErrorUtil.HttpException(400, "Wallet address does not match signature.");
		signedWallet = publicKey.toBase58();
	}
	await redis.del(`signing_message:${userId}:${chain}:${nonce}`);

	const linkedWallet = await getLinkedWalletByAddress(signedWallet);

	if (linkedWallet) {
		if (linkedWallet.userId !== userId) throw new ErrorUtil.HttpException(400, "Wallet already linked to another account.");
		throw new ErrorUtil.HttpException(400, "Wallet already linked to this account.");
	}

	return LinkedWallet.parse(
		(
			await db.sql`INSERT INTO "wallet".linked_wallet ${db.sql({
				id: createId(),
				userId,
				chainType: chain,
				address: signedWallet
			})} RETURNING *`
		)[0]
	);
};

/**
 * Retrieves all linked wallets for a specific user from the database.
 *
 * @async
 * @function getLinkedWallets
 * @param {string} userId - The ID of the user whose linked wallets are to be retrieved.
 * @returns {Promise<LinkedWallet[]>} - A promise that resolves to an array of linked wallets for the specified user.
 */
const getLinkedWallets = async (userId: string): Promise<LinkedWallet[]> =>
	z.array(LinkedWallet).parse(
		await db.sql`SELECT *
                 FROM "wallet".linked_wallet
                 WHERE user_id = ${userId}`
	);

/**
 * This function is used to send reward points to a user's account.
 * It first calculates the points based on the deposit amount (20% of the deposit amount).
 * Then it generates a SQL payload for the points using the UserService's getPointSqlPayload function.
 * Finally, it inserts the points into the "user".point table in the database.
 *
 * @async
 * @function sendDepositPoints
 * @param {TransactionSql} sql - The SQL query function.
 * @param {string} userId - The ID of the user who is making the deposit.
 * @param {number} amount - The amount of the deposit.
 * @param {string} transactionId - The ID of the transaction.
 * @param conversionRate - The conversion rate of the token to USD.
 * @returns {Promise<void>} - A promise that resolves when the points have been inserted into the database.
 * @throws {Error} - If an error occurs while interacting with the database.
 */
const sendDepositPoints = async (sql: TransactionSql, userId: string, amount: number, transactionId: string, conversionRate: number): Promise<void> => {
	const points = Math.ceil(0.2 * amount * conversionRate);
	const pointSqlPayload = UserService.getPointSqlPayload(userId, "deposit", points, {
		transactionId
	});
	await sql`INSERT INTO "user".point ${sql(pointSqlPayload)}`;
};

/**
 * Verifies an ERC20 token deposit transaction.
 * It checks if the transaction already exists, if not, it retrieves the transaction receipt from the blockchain.
 * It then verifies if the transaction is a valid ERC20 transfer event and if the transaction was sent to the platform wallet.
 * If all checks pass, it generates a transaction payload and inserts it into the database.
 * It also sends reward points to the user's account based on the deposit amount.
 *
 * @async
 * @function verifyErc20Deposit
 * @param {string} userId - The ID of the user who is verifying the deposit.
 * @param {ethers.JsonRpcProvider} provider - The Ethereum provider to interact with the blockchain.
 * @param {Token} token - The token involved in the transaction.
 * @param {Chain} chain - The chain where the transaction is happening.
 * @param {string} hash - The hash of the transaction to be verified.
 * @returns {Promise<Transaction>} - A promise that resolves to the inserted transaction if the verification is successful.
 * @throws {ErrorUtil.HttpException} - If the chain is not EVM based, if the token and chain combination is invalid, if the transaction already exists, if the transaction is not found, if the transaction is not a valid ERC20 transfer event, if the transaction was not sent to the platform wallet, or if the transaction was not sent from a linked wallet.
 */
const verifyErc20Deposit = async (userId: string, provider: ethers.JsonRpcProvider, token: Token, chain: Chain, hash: string): Promise<Transaction> => {
	const combination = TokenCombination.find((item) => item.token === token && item.chain === chain);

	if (!combination) {
		throw new ErrorUtil.HttpException(400, "Invalid token and chain combination.");
	}

	if (await getTransactionByHash(hash, chain)) throw new ErrorUtil.HttpException(400, "Transaction already exists.");

	const receipt = await provider.getTransactionReceipt(hash);
	if (!receipt) {
		throw new ErrorUtil.HttpException(400, "Transaction not found.");
	}

	const event = receipt.logs.find((event) => event.topics[0] === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");

	if (!event) {
		throw new ErrorUtil.HttpException(400, "Invalid transaction. No ERC20 transfer event found.");
	}

	const contract = new ethers.Contract(event.address, erc20TransferEventAbi, provider);

	const parsedLog = contract.interface.parseLog(event) as ethers.LogDescription;

	const { from, to, value } = parsedLog.args;

	if (to !== evmWallet.address) {
		throw new ErrorUtil.HttpException(400, "Transaction not sent to platform wallet.");
	}

	const linkedWallets = await getLinkedWalletByAddress(from);

	if (!linkedWallets || linkedWallets.userId !== userId) {
		throw new ErrorUtil.HttpException(400, "Transaction not sent from linked wallet.");
	}

	const amount = Number(ethers.formatUnits(value, combination.decimals));
	const payload = generateTxSqlPayload(userId, "deposit", amount, 0, token, chain, hash);

	return await db.sql.begin(async (sql) => {
		const transaction = Transaction.parse((await sql`INSERT INTO "wallet".transaction ${sql(payload)} RETURNING *`)[0]);
		await sendDepositPoints(sql, userId, transaction.amount, transaction.id, await getTokenConversionRate(combination.address, token));
		return transaction;
	});
};

/**
 * Verifies an SPL token deposit transaction.
 * This function is only applicable for Solana based chains.
 * It checks if the transaction already exists, if not, it retrieves the transaction from the blockchain.
 * It then verifies if the transaction is a valid SPL token transfer event and if the transaction was sent to the platform wallet.
 * If all checks pass, it generates a transaction payload and inserts it into the database.
 * It also sends reward points to the user's account based on the deposit amount.
 *
 * @async
 * @function verifySplTokenDeposit
 * @param {string} userId - The ID of the user who is verifying the deposit.
 * @param {Token} token - The token involved in the transaction.
 * @param {string} hash - The hash of the transaction to be verified.
 * @returns {Promise<Transaction[]>} - A promise that resolves to the inserted transactions if the verification is successful.
 * @throws {ErrorUtil.HttpException} - If the token and chain combination is invalid, if the transaction already exists, if the transaction is not found, if the transaction failed, if no SPL token transfer event found to the platform wallet, if no SPL token transfer event found from the linked wallets to the platform wallet.
 */
const verifySplTokenDeposit = async (userId: string, token: Token, hash: string): Promise<Transaction[]> => {
	const combination = TokenCombination.find((item) => item.token === token && item.chain === "solana");

	if (!combination) throw new ErrorUtil.HttpException(400, "Invalid token and chain combination.");

	if (await getTransactionByHash(hash, "solana")) throw new ErrorUtil.HttpException(400, "Transaction already exists.");

	const transaction = await rpcProviders.solana.getParsedTransaction(hash, {
		maxSupportedTransactionVersion: 0
	});

	if (!transaction) throw new ErrorUtil.HttpException(400, "Transaction not found.");

	if (transaction.meta?.err) throw new ErrorUtil.HttpException(400, "Transaction failed.");

	const tokenAccount = await getOrCreateAssociatedTokenAccount(rpcProviders.solana, solanaWallet, new PublicKey(combination.address), solanaWallet.publicKey, false, "confirmed");

	const transactions = transaction.transaction.message.instructions
		//@ts-ignore
		.filter((i) => i.program === "spl-token")
		.map(
			(i) =>
				//@ts-ignore
				i.parsed as {
					type: string;
					info: {
						amount: string;
						destination: string;
						source: string;
						authority: string;
					};
				}
		)
		.filter((i) => i.type === "transfer")
		.map((i) => i.info)
		.filter((i) => i.destination === tokenAccount.address.toBase58());

	if (!transactions || !transactions.length) throw new ErrorUtil.HttpException(400, "Invalid transaction. No SPL token transfer found to the platform wallet.");

	const linkedWallets = await getLinkedWallets(userId);

	const insertTxSqlPayload: Transaction[] = [];

	for (const transaction of transactions) {
		if (!linkedWallets.find((i) => i.address === transaction.authority)) continue;

		const account = (await rpcProviders.solana.getParsedAccountInfo(new PublicKey(transaction.source))) as RpcResponseAndContext<AccountInfo<Buffer | ParsedAccountData>>;
		//@ts-ignore
		const mint = account.value.data?.parsed?.info?.mint;
		if (mint !== combination.address) continue;

		const payload = generateTxSqlPayload(userId, "deposit", Number(transaction.amount) / 10 ** combination.decimals, 0, token, "solana", hash);
		insertTxSqlPayload.push(payload);
	}

	if (!insertTxSqlPayload.length) throw new ErrorUtil.HttpException(400, `Invalid transaction. No SPL ${token} token transfer event found from the linked wallets to the platform wallet.`);

	return db.sql.begin(async (sql) => {
		const transactions = z.array(Transaction).parse(await db.sql`INSERT INTO "wallet".transaction ${db.sql(insertTxSqlPayload)} RETURNING *`);

		for (const transaction of transactions) {
			await sendDepositPoints(sql, userId, transaction.amount, transaction.id, await getTokenConversionRate(combination.address, token));
		}

		return transactions;
	});
};

/**
 * This function is used to withdraw ERC20 tokens from a user's account.
 * It first checks if the token and chain combination is valid.
 * Then it retrieves the user's balance for the specified token and chain.
 * It checks if the user has sufficient balance to withdraw the specified amount.
 * It also checks if the user has not exceeded the maximum number of transactions per hour.
 * If all checks pass, it creates a new Ethereum wallet with the platform's private key and the provided Ethereum provider.
 * It then creates a new contract instance for the token using the platform's wallet as the signer.
 * It sends a transfer transaction to the blockchain to transfer the specified amount of tokens to the provided address.
 * It waits for the transaction to be mined.
 * Finally, it creates a new transaction in the database for the withdrawal and returns it.
 *
 * @async
 * @function withDrawErc20Token
 * @param {string} userId - The ID of the user who is making the withdrawal.
 * @param {number} amount - The amount of tokens to withdraw.
 * @param {string} address - The address to send the tokens to.
 * @param {Token} token - The token to withdraw.
 * @param {Chain} chain - The chain where the token resides.
 * @param {ethers.JsonRpcProvider} provider - The Ethereum provider to interact with the blockchain.
 * @returns {Promise<Transaction>} - A promise that resolves to the created transaction.
 * @throws {ErrorUtil.HttpException} - If the token and chain combination is invalid, if the user has insufficient balance, if the user has exceeded the maximum number of transactions per hour, or if an error occurs while interacting with the blockchain.
 */
const withDrawErc20Token = async (userId: string, amount: number, address: string, token: Token, chain: Chain, provider: ethers.JsonRpcProvider): Promise<Transaction> => {
	const combination = TokenCombination.find((item) => item.token === token && item.chain === chain);
	if (!combination) throw new ErrorUtil.HttpException(400, "Invalid token and chain combination.");

	const { totalBalance, rewardBalance } = await getUserTokenBalance(db.sql, userId, token, chain);
	const balance = totalBalance - rewardBalance;

	if (amount > balance) throw new ErrorUtil.HttpException(400, "Insufficient balance.");

	const [{ count }] = (await db.sql`SELECT COUNT(*)
                                    FROM "wallet".transaction
                                    WHERE user_id = ${userId}
                                      AND tx_for = 'withdraw'
                                      AND created_at > NOW() - INTERVAL '1 hour'`) as [{ count: string }];
	if (Number(count) > 5) throw new ErrorUtil.HttpException(400, "Maximum 5 transactions per hour.");

	const signer = new ethers.Wallet(EVM_PRIVATE_KEY as string, provider);

	const contract = new ethers.Contract(combination.address, erc20TransferEventAbi, signer);

	const tx = await contract.transfer(address, ethers.parseUnits(amount.toString(), combination.decimals));
	await tx.wait();

	const payload = generateTxSqlPayload(userId, "withdraw", -amount, 0, token, chain, tx.hash);
	return Transaction.parse((await db.sql`INSERT INTO "wallet".transaction ${db.sql(payload)} RETURNING *`)[0]);
};

/**
 * This function is used to withdraw SPL tokens from a user's account.
 * It first checks if the token and chain combination is valid.
 * Then it retrieves the user's balance for the specified token in the Solana chain.
 * It checks if the user has sufficient balance to withdraw the specified amount.
 * It also checks if the user has not exceeded the maximum number of transactions per hour.
 * If all checks pass, it retrieves the source and destination accounts for the token transfer.
 * It then creates a new Solana transaction and adds a transfer instruction to it.
 * It sends the transaction to the Solana network and waits for it to be confirmed.
 * Finally, it creates a new transaction in the database for the withdrawal and returns it.
 *
 * @async
 * @function withdrawSplToken
 * @param {string} userId - The ID of the user who is making the withdrawal.
 * @param {number} amount - The amount of tokens to withdraw.
 * @param {string} address - The address to send the tokens to.
 * @param {Token} token - The token to withdraw.
 * @returns {Promise<Transaction>} - A promise that resolves to the created transaction.
 * @throws {ErrorUtil.HttpException} - If the token and chain combination is invalid, if the user has insufficient balance, if the user has exceeded the maximum number of transactions per hour, or if an error occurs while interacting with the blockchain.
 */
const withdrawSplToken = async (userId: string, amount: number, address: string, token: Token): Promise<Transaction> => {
	const combination = TokenCombination.find((item) => item.token === token && item.chain === "solana");
	if (!combination) throw new ErrorUtil.HttpException(400, "Invalid token and chain combination.");

	const { totalBalance, rewardBalance } = await getUserTokenBalance(db.sql, userId, token, "solana");
	const balance = totalBalance - rewardBalance;

	if (amount > balance) throw new ErrorUtil.HttpException(400, "Insufficient balance.");

	const [{ count }] = (await db.sql`SELECT COUNT(*)
                                    FROM "wallet".transaction
                                    WHERE user_id = ${userId}
                                      AND tx_for = 'withdraw'
                                      AND created_at > NOW() - INTERVAL '1 hour'`) as [{ count: string }];
	if (Number(count) > 5) throw new ErrorUtil.HttpException(400, "Maximum 5 transactions per hour.");

	const provider = rpcProviders.solana;

	const source = await getOrCreateAssociatedTokenAccount(provider, solanaWallet, new PublicKey(combination.address), solanaWallet.publicKey, false, "confirmed");

	const destination = await getOrCreateAssociatedTokenAccount(provider, solanaWallet, new PublicKey(combination.address), new PublicKey(address), false, "confirmed");

	const tx = new SolanaTransaction(); //Alias for Transaction
	tx.add(createTransferInstruction(source.address, destination.address, solanaWallet.publicKey, amount * 10 ** combination.decimals));

	const PRIORITY_RATE = 1000;
	const computePriceIx = ComputeBudgetProgram.setComputeUnitPrice({
		microLamports: PRIORITY_RATE
	});
	tx.add(computePriceIx);

	const latestBlockHash = await provider.getLatestBlockhash("confirmed");
	tx.recentBlockhash = latestBlockHash.blockhash;

	const signature = await sendAndConfirmTransaction(provider, tx, [solanaWallet], {
		commitment: "confirmed"
	});

	const payload = generateTxSqlPayload(userId, "withdraw", -amount, 0, token, "solana", signature);

	return Transaction.parse((await db.sql`INSERT INTO "wallet".transaction ${db.sql(payload)} RETURNING *`)[0]);
};

/**
 * This function is used to get the conversion rate of a token to USD.
 * It supports two types of tokens: "eth" and other ERC20 tokens.
 * For "eth", it fetches the conversion rate from the Coinbase API.
 * For other ERC20 or SPL tokens, it fetches the conversion rate from the DexScreener API.
 *
 * @async
 * @function getTokenConversionRate
 * @param {string} address - The contract address of the ERC20 or SPL token. This is not used if the token is "eth".
 * @param {Token} token - The token to get the conversion rate for. This can be "eth" or any ERC20 or SPL token.
 * @returns {Promise<number>} - A promise that resolves to the conversion rate of the token to USD.
 * @throws {Error} - If an error occurs while fetching the conversion rate from the API.
 */
const getTokenConversionRate = async (address: string, token: Token): Promise<number> => {
	if (token === "eth") {
		const data = (await fetch(`https://api.coinbase.com/v2/exchange-rates?currency=${token}`).then((res) => res.json())) as {
			data: {
				rates: {
					USD: string;
				};
			};
		};
		return Number(data.data.rates.USD);
	}

	const data = (await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`).then((res) => res.json())) as {
		pairs: { chainId: string; priceUsd: string }[];
	};

	return Number(data.pairs[0].priceUsd);
};

export {
	Token,
	Chain,
	TransactionStatus,
	TransactionFor,
	Transaction,
	TokenCombination,
	Balance,
	LinkedWallet,
	ChainType,
	generateTxSqlPayload,
	getUserTokenBalance,
	getUserBalance,
	getTransactions,
	getSigningMessage,
	verifyMessage,
	getLinkedWallets,
	verifyErc20Deposit,
	verifySplTokenDeposit,
	withDrawErc20Token,
	withdrawSplToken,
	getTokenConversionRate
};
