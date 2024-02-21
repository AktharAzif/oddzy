import { createId } from "@paralleldrive/cuid2";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";

const Token = z.enum(["gone", "toshi", "myro", "eth"]);
type Token = z.infer<typeof Token>;
const Chain = z.enum(["matic", "base", "solana", "polygon_zkevm"]);
type Chain = z.infer<typeof Chain>;

const TransactionStatus = z.enum(["pending", "completed"]);
type TransactionStatus = z.infer<typeof TransactionStatus>;

const TransactionFor = z.enum(["bet", "bet_cancel", "bet_win", "withdraw", "deposit"]);
type TransactionFor = z.infer<typeof TransactionFor>;

const Transaction = z.object({
	id: z.string().default(() => createId()),
	userId: z.string(),
	amount: z.number(),
	rewardAmount: z.number(),
	txFor: z.string(),
	txStatus: z.string(),
	txHash: z.string().nullable().default(null),
	token: Token,
	chain: Chain,
	betId: z.string().nullable().default(null),
	betQuantity: z.number().nullable().default(null),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date())
});
type Transaction = z.infer<typeof Transaction>;

const TokenCombination = [
	{
		token: "gone",
		chain: "matic"
	},
	{
		token: "toshi",
		chain: "base"
	},
	{
		token: "myro",
		chain: "solana"
	},
	{
		token: "eth",
		chain: "polygon_zkevm"
	}
] as const;

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

const getUserTokenBalance = async (
	sql: TransactionSql | Sql,
	userId: string,
	token: Token,
	chain: Chain
): Promise<{
	rewardBalance: number;
	totalBalance: number;
}> => {
	const [{ rewardBalance, totalBalance }] = (await sql`
      SELECT SUM(reward_amount) as          reward_balance,
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

	return {
		rewardBalance: Number(rewardBalance),
		totalBalance: Number(totalBalance)
	};
};

export { Token, Chain, TransactionStatus, TransactionFor, Transaction, TokenCombination, generateTxSqlPayload, getUserTokenBalance };
