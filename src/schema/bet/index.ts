import { builder } from "../../config";
import { BetService, UserService } from "../../service";
import { PlaceBetPayload } from "./input.ts";
import { Bet, BetFilterEnum, BetPaginatedResponse, BetStatusEnum, BetTypeEnum } from "./object.ts";

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
			})
		},
		validate: {
			schema: PlaceBetPayload
		},
		resolve: async (_, arg, { user }) => await BetService.placeBet((user as UserService.User).id, arg)
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
				type: BetFilterEnum,
				description: "The filter to be applied to the bets based on time. It can be either day, week, month, year or all"
			}),
			type: t.arg({
				type: BetTypeEnum,
				description: "The type of the bet. It can be either buy or sell"
			})
		},
		resolve: async (_, { eventId, page, limit, status, filter, type }, { user, admin }) => {
			if (!admin && eventId) throw new Error("You are only authorized to access your bets");
			const userId = user && user.id;
			return await BetService.getBets(eventId, userId, status, filter, type, page - 1, limit);
		},
		description: "Get all bets filtered by user and event. Either eventId or userId is required"
	})
);

export { PlaceBetPayload, BetPaginatedResponse };
