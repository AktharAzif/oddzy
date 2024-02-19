import { z } from "zod";

const Token = z.enum(["gone", "toshi", "myro", "eth"]);
type Token = z.infer<typeof Token>;
const Chain = z.enum(["matic", "base", "solana", "polygon_zkevm"]);
type Chain = z.infer<typeof Chain>;

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

export { Token, Chain, TokenCombination };
