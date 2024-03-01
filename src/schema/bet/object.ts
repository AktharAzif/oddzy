import { builder } from "../../config";
import { BetService } from "../../service";

const BetTypeEnum = builder.enumType("BetTypeEnum", {
	values: BetService.BetType.options
});

const Bet = builder.objectRef<BetService.Bet>("Bet").implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the bet"
		}),
		eventId: t.exposeString("eventId", {
			description: "The unique identifier of the event the bet is placed on"
		}),
		optionId: t.exposeInt("optionId", {
			description: "The unique identifier of the option the bet is placed on"
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
		})
	}),
	description: "The bet response object"
});

export { Bet, BetTypeEnum };
