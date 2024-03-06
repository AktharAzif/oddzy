import { builder } from "../../config";
import { BetService, UserService } from "../../service";
import { UserSchema, WalletSchema } from "../index.ts";
import { GetBetsPayload, PlaceBetPayload } from "./input.ts";
import { Bet, BetPaginatedResponse, BetStatusEnum, BetTypeEnum, InvestedAndCurrentAmountResponse } from "./object.ts";

builder.mutationField("placeBet", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || false,
		type: Bet,
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event the bet is placed on" }),
			optionId: t.arg.int({ required: true, description: "The unique identifier of the option the bet is placed on" }),
			price: t.arg.float({ description: "The price per quantity of the bet. Required for limit order" }),
			quantity: t.arg.int({ required: true, description: "The quantity of the bet" }),
			type: t.arg({
				type: BetTypeEnum,
				required: true,
				description: "The type of the bet. It can be either buy or sell"
			}),
			buyBetId: t.arg.string({
				description: "Buy bet id for sell bet. Must be present if the bet is a sell bet"
			}),
			referredBy: t.arg.string({ description: "The unique identifier of the user who invited the user to place the bet" })
		},
		validate: {
			schema: PlaceBetPayload
		},
		resolve: async (_, arg, { user }) => await BetService.placeBet((user as UserService.User).id, arg),
		description: "Place a bet"
	})
);

builder.queryField("bets", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || { admin: true },
		type: BetPaginatedResponse,
		args: {
			eventId: t.arg.string({ description: "The unique identifier of the event" }),
			page: t.arg.int({
				required: true,
				description: "The page number. Min 1.",
				validate: { min: 1 },
				defaultValue: 1
			}),
			limit: t.arg.int({
				required: true,
				description: "The number of bets per page. Min 1, Max 100.",
				validate: { min: 1, max: 100 },
				defaultValue: 20
			}),
			status: t.arg({
				type: BetStatusEnum,
				description: "The status of the bet. It can be either live or closed"
			}),
			filter: t.arg({
				type: UserSchema.TimeFilterEnum,
				description: "The filter to be applied to the bets based on time. It can be either day, week, month, year or all"
			}),

			type: t.arg({
				type: BetTypeEnum,
				description: "The type of the bet. It can be either buy or sell"
			}),
			token: t.arg({
				type: WalletSchema.TokenEnum,
				description: "The token of the bet"
			}),
			chain: t.arg({
				type: WalletSchema.ChainEnum,
				description: "The chain of the bet"
			})
		},
		resolve: async (_, { page, limit, ...args }, { user, admin }) => {
			if (!admin && args.eventId) throw new Error("You are only authorized to access your bets");
			const userId = user && user.id;
			return await BetService.getBets(userId, args, page - 1, limit);
		},
		description: "Get all bets filtered by user, event, status, filter and type. Either userId or eventId is required"
	})
);

builder.mutationField("cancelBet", (t) =>
	t.field({
		type: Bet,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			betId: t.arg.string({ required: true, description: "The unique identifier of the bet" }),
			quantity: t.arg.int({
				required: true,
				validate: { positive: true },
				description: "The quantity of the bet to be cancelled"
			}),
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event the bet is placed on" })
		},
		resolve: async (_, { betId, quantity, eventId }, { user }) => await BetService.cancelBet((user as UserService.User).id, eventId, betId, quantity),
		description: "Cancel a bet"
	})
);

builder.queryField("investedAndCurrentAmount", (t) =>
	t.field({
		type: InvestedAndCurrentAmountResponse,
		authScopes: (_, __, { user }) => (user && user.access) || false,
		args: {
			status: t.arg({
				type: BetStatusEnum,
				description: "The status of the bet. It can be either live or closed",
				required: true
			}),
			filter: t.arg({
				type: UserSchema.TimeFilterEnum,
				description: "The filter to be applied to the bets based on time. It can be either day, week, month, year or all",
				required: true,
				defaultValue: "all"
			}),
			token: t.arg({
				type: WalletSchema.TokenEnum,
				description: "The token of the bet"
			}),
			chain: t.arg({
				type: WalletSchema.ChainEnum,
				description: "The chain of the bet"
			})
		},
		resolve: async (_, { status, filter, token, chain }, { user }) => await BetService.getInvestedAndCurrentAmount((user as UserService.User).id, filter, status, token, chain),
		description: "Get invested and current amount"
	})
);

export { Bet, PlaceBetPayload, BetPaginatedResponse, GetBetsPayload };
