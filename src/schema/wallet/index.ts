import { builder, rpcProviders } from "../../config";
import { UserService, WalletService } from "../../service";
import { ErrorUtil } from "../../util";
import { Balance, ChainEnum, ChainType, LinkedWallet, SigningMessageResponse, TokenEnum, Transaction } from "./object.ts";

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
		type: [Transaction],
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
			signature: t.arg.string({ required: true, description: "The signed message." }),
			nonce: t.arg.string({ required: true, description: "The nonce received from the signing message." })
		},
		resolve: async (_, { signature, nonce, chainType }, { user }) => await WalletService.verifyMessage((user as UserService.User).id, chainType, nonce, signature),
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
			chain: t.arg({
				type: ChainEnum,
				required: true,
				description: "The chain of the deposit."
			}),
			hash: t.arg.string({ required: true, description: "The transaction hash of the deposit." })
		},
		resolve: async (_, { chain, hash, token }, { user }) => {
			if (chain !== "solana") throw new ErrorUtil.HttpException(400, "Use depositErc20Token for Ethereum chain");

			return await WalletService.verifySplTokenDeposit((user as UserService.User).id, token, hash);
		},
		description: "Verify the deposit of a SPL token to the user's account."
	})
);

export { TokenEnum, ChainEnum };
