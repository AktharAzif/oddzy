import { builder, rpcProviders } from "../../config";
import { UserService, WalletService } from "../../service";
import { ErrorUtil } from "../../util";
import { Balance, ChainEnum, ChainType, LinkedWallet, SigningMessageResponse, TokenCombination, TokenEnum, Transaction, TransactionPaginatedResponse } from "./object.ts";

builder.queryField("balance", (t) =>
	t.field({
		type: [Balance],
		authScopes: (_, __, { user }) => (user && user.access) || false,
		resolve: async (_, __, { user }) => await WalletService.getUserBalance((user as UserService.User).id),
		description: "Fetches the balance of the user."
	})
);

builder.queryField("linkedWallets", (t) =>
	t.field({
		type: [LinkedWallet],
		authScopes: (_, __, { user }) => (user && user.access) || false,
		resolve: async (_, __, { user }) => await WalletService.getLinkedWallets((user as UserService.User).id)
	})
);

builder.queryField("signingMessage", (t) =>
	t.field({
		type: SigningMessageResponse,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			chainType: t.arg({
				type: ChainType,
				required: true,
				description: "The chain type of the signing message. Either EVM or Solana."
			})
		},
		resolve: async (_, { chainType }, { user }) => await WalletService.getSigningMessage((user as UserService.User).id, chainType),
		description: "Fetches the signing message for linking a wallet."
	})
);

builder.queryField("transactions", (t) =>
	t.field({
		type: TransactionPaginatedResponse,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				description: "The page number. Min 1.",
				validate: { min: 1 }
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				description: "The limit of transactions per page. Max 100.",
				validate: { max: 100, min: 1 }
			}),
			chain: t.arg({
				type: ChainEnum,
				required: false,
				description: "The chain in which the transactions are to be fetched."
			}),
			token: t.arg({
				type: TokenEnum,
				required: false,
				description: "The token in which the transactions are to be fetched."
			})
		},
		resolve: async (_, { page, limit, chain, token }, { user }) => {
			return await WalletService.getTransactions((user as UserService.User).id, token, chain, page - 1, limit);
		},
		description: "Fetches the transactions of the user."
	})
);

builder.mutationField("linkWallet", (t) =>
	t.field({
		type: LinkedWallet,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			chainType: t.arg({
				type: ChainType,
				required: true,
				description: "The chain type of the wallet. Either EVM or Solana."
			}),
			wallet: t.arg.string({ required: true, description: "The wallet address used to sign the message." }),
			signature: t.arg.string({ required: true, description: "The signed message." }),
			nonce: t.arg.string({ required: true, description: "The nonce received from the signing message." })
		},
		resolve: async (_, { signature, nonce, chainType, wallet }, { user }) => await WalletService.verifyMessage((user as UserService.User).id, chainType, nonce, wallet, signature),
		description: "Link a wallet to the user's account."
	})
);

builder.mutationField("depositErc20Token", (t) =>
	t.field({
		type: Transaction,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			token: t.arg({
				type: TokenEnum,
				required: true,
				description: "The ERC20 token name."
			}),
			chain: t.arg({
				type: ChainEnum,
				required: true,
				description: "The chain of the deposit."
			}),
			hash: t.arg.string({ required: true, description: "The transaction hash of the deposit." })
		},
		resolve: async (_, { chain, hash, token }, { user }) => {
			if (chain === "solana") throw new ErrorUtil.HttpException(400, "Use depositSplToken for Solana chain");

			const provider = rpcProviders[chain];
			return await WalletService.verifyErc20Deposit((user as UserService.User).id, provider, token, chain, hash);
		},
		description: "Verify the deposit of an ERC20 token to the user's account."
	})
);

builder.mutationField("depositSplToken", (t) =>
	t.field({
		type: [Transaction],
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			token: t.arg({
				type: TokenEnum,
				required: true,
				description: "The SPL token name."
			}),
			hash: t.arg.string({ required: true, description: "The transaction hash of the deposit." })
		},
		resolve: async (_, { hash, token }, { user }) => await WalletService.verifySplTokenDeposit((user as UserService.User).id, token, hash),
		description: "Verify the deposit of a SPL token to the user's account."
	})
);

builder.queryField("tokenCombinations", (t) =>
	t.field({
		type: [TokenCombination],
		resolve: () => WalletService.TokenCombination,
		description: "Fetches the token combinations."
	})
);

builder.mutationField("withdrawErc20Token", (t) =>
	t.field({
		type: Transaction,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			token: t.arg({
				type: TokenEnum,
				required: true,
				description: "The ERC20 token name."
			}),
			chain: t.arg({
				type: ChainEnum,
				required: true,
				description: "The chain of the deposit."
			}),
			address: t.arg.string({ required: true, description: "The address to which the tokens are to be withdrawn." }),
			amount: t.arg.int({ required: true, description: "The amount of tokens to be withdrawn." })
		},
		resolve: async (_, { chain, amount, address, token }, { user }) => {
			if (chain === "solana") throw new ErrorUtil.HttpException(400, "Use withdrawSplToken for Solana chain");

			const provider = rpcProviders[chain];
			return await WalletService.withDrawErc20Token((user as UserService.User).id, amount, address, token, chain, provider);
		},
		description: "Withdraw an ERC20 token from the user's account."
	})
);

builder.mutationField("withdrawSplToken", (t) =>
	t.field({
		type: Transaction,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			token: t.arg({
				type: TokenEnum,
				required: true,
				description: "The SPL token name."
			}),
			address: t.arg.string({ required: true, description: "The address to which the tokens are to be withdrawn." }),
			amount: t.arg.int({ required: true, description: "The amount of tokens to be withdrawn." })
		},
		resolve: async (_, { address, amount, token }, { user }) => await WalletService.withdrawSplToken((user as UserService.User).id, amount, address, token),
		description: "Withdraw an SPL token from the user's account."
	})
);

export { TokenEnum, ChainEnum };
