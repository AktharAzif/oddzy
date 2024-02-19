import { z } from "zod";

const Token = z.enum(["gone", "toshi", "myro", "eth"]);
type Token = z.infer<typeof Token>;
const Chain = z.enum(["matic", "base", "solana", "polygon_zkevm"]);
type Chain = z.infer<typeof Chain>;

const Transaction = z.object({
	id: z.string(),
	user_id: z.string(),
	amount: z.number(),
	reward_amount: z.number(),
	tx_for: z.string(),
	tx_status: z.string(),
	tx_hash: z.string().nullable(),
	token: Token,
	chain: Chain,
	bet_id: z.string().nullable(),
	bet_quantity: z.number().nullable(),
	created_at: z.date(),
	updated_at: z.date()
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

export { Token, Chain, TokenCombination, Transaction };
