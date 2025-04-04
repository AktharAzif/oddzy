import { builder } from "../../config";
import { EventService, UserService, WalletService } from "../../service";
import { EventSchema, UserSchema } from "../index.ts";

const TokenEnum = builder.enumType("TokenEnum", {
	values: WalletService.Token.options
});

const ChainEnum = builder.enumType("ChainEnum", {
	values: WalletService.Chain.options
});

const ChainType = builder.enumType("ChainType", {
	values: WalletService.ChainType.options
});

const TransactionStatus = builder.enumType("TransactionStatus", {
	values: WalletService.TransactionStatus.options
});

const TransactionFor = builder.enumType("TransactionFor", {
	values: WalletService.TransactionFor.options
});

const Balance = builder.objectRef<WalletService.Balance>("Balance");

Balance.implement({
	fields: (t) => ({
		rewardBalance: t.exposeFloat("rewardBalance", {
			description: "The reward balance of the user"
		}),
		totalBalance: t.exposeFloat("totalBalance", {
			description: "The total balance of the user"
		}),
		userId: t.exposeString("userId", {
			description: "Id of the user whose balance is being fetched"
		}),
		user: t.field({
			type: UserSchema.User,
			resolve: async (parent) => await UserService.getUser(parent.userId),
			description: "The user whose balance is being fetched"
		}),
		token: t.field({
			type: TokenEnum,
			resolve: (parent) => parent.token,
			description: "The token of the balance"
		}),
		chain: t.field({
			type: ChainEnum,
			resolve: (parent) => parent.chain,
			description: "The chain of the balance"
		})
	}),
	description: "The user balance response object."
});

const LinkedWallet = builder.objectRef<WalletService.LinkedWallet>("LinkedWallet");

LinkedWallet.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the linked wallet."
		}),
		userId: t.exposeString("userId", {
			description: "Id of the user associated with the linked wallet."
		}),
		user: t.field({
			type: UserSchema.User,
			resolve: async (parent) => await UserService.getUser(parent.userId),
			description: "The user associated with the linked wallet."
		}),
		chainType: t.field({
			type: ChainType,
			resolve: (parent) => parent.chainType,
			description: "The chain type of the linked wallet. Either EVM or Solana."
		}),
		address: t.exposeString("address", {
			description: "The address of the linked wallet."
		}),
		createdAt: t.field({
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the wallet was linked."
		})
	}),
	description: "The linked wallet response object."
});

const Transaction = builder.objectRef<WalletService.Transaction>("Transaction");

Transaction.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the transaction."
		}),
		userId: t.exposeString("userId", {
			description: "Id of the user associated with the transaction."
		}),
		user: t.field({
			type: UserSchema.User,
			resolve: async (parent) => await UserService.getUser(parent.userId),
			description: "The user associated with the transaction."
		}),
		amount: t.exposeFloat("amount", {
			description: "The amount of the transaction."
		}),
		rewardAmount: t.exposeFloat("rewardAmount", {
			description: "The reward amount of the transaction."
		}),
		txFor: t.field({
			type: TransactionFor,
			resolve: (parent) => parent.txFor,
			description: "The purpose of the transaction."
		}),
		txStatus: t.field({
			type: TransactionStatus,
			resolve: (parent) => parent.txStatus,
			description: "The status of the transaction."
		}),
		txHash: t.exposeString("txHash", {
			nullable: true,
			description: "The hash of the transaction."
		}),
		token: t.field({
			type: TokenEnum,
			resolve: (parent) => parent.token,
			description: "The token of the transaction."
		}),
		chain: t.field({
			type: ChainEnum,
			resolve: (parent) => parent.chain,
			description: "The chain of the transaction."
		}),
		betId: t.exposeString("betId", {
			nullable: true,
			description: "The unique identifier of the bet associated with the transaction."
		}),
		event: t.field({
			type: EventSchema.Event,
			resolve: async (parent) => (parent.betId ? await EventService.getEventByBetId(parent.betId) : null),
			nullable: true
		}),
		betQuantity: t.exposeFloat("betQuantity", {
			nullable: true,
			description: "The quantity of the bet associated with the transaction."
		}),
		createdAt: t.field({
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the transaction was created."
		}),
		updatedAt: t.field({
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the transaction was last updated."
		})
	}),
	description: "The transaction response object."
});

const TransactionPaginatedResponse = builder.objectRef<{
	transactions: WalletService.Transaction[];
	total: number;
	page: number;
	limit: number;
}>("TransactionPaginatedResponse");

TransactionPaginatedResponse.implement({
	fields: (t) => ({
		transactions: t.field({
			type: [Transaction],
			resolve: (parent) => parent.transactions,
			description: "The list of transactions."
		}),
		total: t.exposeInt("total", {
			description: "The total number of transactions."
		}),
		page: t.exposeInt("page", {
			description: "Current page number."
		}),
		limit: t.exposeInt("limit", {
			description: "The number of transactions per page."
		})
	}),
	description: "The paginated response object for the transactions."
});
type TransactionPaginatedResponse = typeof TransactionPaginatedResponse.$inferType;

const SigningMessageResponse = builder.objectRef<{
	message: string;
	nonce: string;
}>("SigningMessageResponse");

SigningMessageResponse.implement({
	fields: (t) => ({
		message: t.exposeString("message", {
			description: "The message to be signed."
		}),
		nonce: t.exposeString("nonce", {
			description: "The nonce to be signed."
		})
	}),
	description: "The response object for the signing message."
});

const TokenCombination = builder.objectRef<{
	token: WalletService.Token;
	chain: WalletService.Chain;
	address: string;
	decimals: number;
}>("TokenCombination");

TokenCombination.implement({
	fields: (t) => ({
		token: t.field({
			type: TokenEnum,
			resolve: (parent) => parent.token,
			description: "The token name."
		}),
		chain: t.field({
			type: ChainEnum,
			resolve: (parent) => parent.chain,
			description: "The chain name."
		}),
		address: t.exposeString("address", {
			description: "The address of the token."
		}),
		decimals: t.exposeInt("decimals", {
			description: "The decimals of the token."
		}),
		price: t.field({
			type: "Float",
			resolve: async (parent) => await WalletService.getTokenConversionRate(parent.address, parent.token),
			description: "The price of the token in USD."
		})
	}),
	description: "The response object for the token combination."
});

export { ChainEnum, ChainType, TokenEnum, Balance, LinkedWallet, Transaction, SigningMessageResponse, TokenCombination, TransactionPaginatedResponse };
