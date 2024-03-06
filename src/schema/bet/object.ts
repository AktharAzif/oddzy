import { EventSchema } from "..";
import { builder, db } from "../../config";
import { BetService, EventService } from "../../service";

const BetTypeEnum = builder.enumType("BetTypeEnum", {
	values: BetService.BetType.options,
	description: "The type of the bet. It can be either buy or sell"
});

const BetStatusEnum = builder.enumType("BetStatusEnum", {
	values: BetService.BetStatus.options,
	description: "The status of the bet. It can be either live or closed"
});

const Bet = builder.objectRef<BetService.Bet>("Bet");

Bet.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the bet"
		}),
		eventId: t.exposeString("eventId", {
			description: "The unique identifier of the event the bet is placed on"
		}),
		event: t.field({
			type: EventSchema.Event,
			resolve: async (parent, _) => await EventService.getEvent(db.sql, parent.eventId),
			description: "The event the bet is placed on"
		}),
		optionId: t.exposeInt("optionId", {
			description: "The unique identifier of the option the bet is placed on"
		}),
		option: t.field({
			type: EventSchema.Option,
			resolve: async (parent, _) => await EventService.getOption(parent.optionId),
			description: "The option the bet is placed on"
		}),
		userId: t.exposeString("userId", {
			nullable: true,
			description: "The unique identifier of the user who placed the bet"
		}),
		pricePerQuantity: t.exposeFloat("pricePerQuantity", {
			description: "The price per quantity of the bet"
		}),
		quantity: t.exposeInt("quantity", {
			description: "The quantity of the bet"
		}),
		rewardAmountUsed: t.exposeFloat("rewardAmountUsed", {
			authScopes: { admin: true },
			description: "The reward amount used for placing the bet. Only admin can see this field"
		}),
		unmatchedQuantity: t.exposeInt("unmatchedQuantity", {
			description: "The unmatched quantity of the bet"
		}),
		type: t.field({
			type: BetTypeEnum,
			resolve: (parent) => parent.type,
			description: "The type of the bet. It can be either buy or sell"
		}),
		limitOrder: t.exposeBoolean("limitOrder", {
			description: "Indicates whether the bet is a limit order or not"
		}),
		buyBetId: t.exposeString("buyBetId", {
			nullable: true,
			description: "Buy bet id for sell bet. Must be present if the bet is a sell bet"
		}),
		buyBet: t.field({
			type: Bet,
			resolve: async (parent) => (parent.buyBetId ? await BetService.getBet(db.sql, parent.buyBetId) : null),
			description: "The buy bet for the sell bet. Will be null for buy bet",
			nullable: true
		}),
		profit: t.exposeFloat("profit", { nullable: true, description: "Profit earned from the bet" }),
		platformCommission: t.exposeFloat("platformCommission", {
			nullable: true,
			description: "Platform commission deducted from the bet"
		}),
		soldQuantity: t.exposeInt("soldQuantity", {
			nullable: true,
			description: "The quantity of the bet sold for buy bet. Will be null for buy bet"
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the bet was created. Only admin can see this field"
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the bet was last updated. Only admin can see this field"
		}),
		cancellable: t.field({
			authScopes: (_, __, { user }) => (user && user.access) || false,
			type: "Boolean",
			resolve: async ({ id, eventId }) => !(await BetService.isTop5Bet(db.sql, eventId, id, true)) as boolean,
			description: "Indicates whether the bet can be cancelled or not"
		})
	}),
	description: "The bet response object"
});

const BetPaginatedResponse = builder.objectRef<{
	bets: BetService.Bet[];
	total: number;
	page: number;
	limit: number;
}>("BetPaginatedResponse");

BetPaginatedResponse.implement({
	fields: (t) => ({
		bets: t.field({
			type: [Bet],
			resolve: (parent) => parent.bets,
			description: "The bets"
		}),
		total: t.exposeInt("total", {
			description: "The total number of bets"
		}),
		page: t.exposeInt("page", {
			description: "Current page number"
		}),
		limit: t.exposeInt("limit", {
			description: "The number of bets per page"
		})
	}),
	description: "The paginated bet response object."
});
type BetPaginatedResponse = typeof BetPaginatedResponse.$inferType;

export { Bet, BetTypeEnum, BetStatusEnum, BetPaginatedResponse };
