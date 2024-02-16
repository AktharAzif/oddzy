const Token = ["gone", "toshi", "myro", "eth"] as const;

const Chain = ["matic", "base", "solana", "polygon_zkevm"] as const;

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
