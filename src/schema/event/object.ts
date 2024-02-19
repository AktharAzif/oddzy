import { WalletSchema } from "..";
import { builder } from "../../config";
import { EventService } from "../../service";
import { BetTypeEnum, EventStatusEnum } from "./enum.ts";

const Category = builder.objectRef<EventService.Category>("Category").implement({
	fields: (t) => ({
		id: t.exposeInt("id"),
		name: t.exposeString("name"),
		description: t.exposeString("description", { nullable: true }),
		imageUrl: t.exposeString("image_url", { nullable: true }),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

const Event = builder
	.objectRef<
		EventService.Event & {
			category?: EventService.Category[];
			option?: EventService.Option[];
			source?: EventService.Source[];
		}
	>("Event")
	.implement({
		fields: (t) => ({
			id: t.exposeString("id"),
			name: t.exposeString("name"),
			description: t.exposeString("description", { nullable: true }),
			info: t.exposeString("info", { nullable: true }),
			imageUrl: t.exposeString("image_url", { nullable: true }),
			startAt: t.field({
				type: "Date",
				resolve: (parent) => parent.start_at
			}),
			endAt: t.field({
				type: "Date",
				resolve: (parent) => parent.end_at
			}),
			frozen: t.exposeBoolean("frozen"),
			optionWon: t.exposeInt("option_won", { nullable: true }),
			platformLiquidityLeft: t.exposeFloat("platform_liquidity_left"),
			minLiquidityPercentage: t.exposeFloat("min_liquidity_percentage"),
			maxLiquidityPercentage: t.exposeFloat("max_liquidity_percentage"),
			liquidityInBetween: t.exposeBoolean("liquidity_in_between"),
			platformFeesPercentage: t.exposeFloat("platform_fees_percentage"),
			winPrice: t.exposeFloat("win_price"),
			slippage: t.exposeFloat("slippage"),
			category: t.field({
				type: [Category],
				resolve: async (parent) => parent.category || (await EventService.getEventCategories(parent.id))
			}),
			option: t.field({
				type: [Option],
				resolve: async (parent) => parent.option || (await EventService.getEventOptions(parent.id))
			}),
			source: t.field({
				type: [Source],
				resolve: async (parent) => parent.source || (await EventService.getEventSources(parent.id))
			}),
			token: t.field({
				type: WalletSchema.TokenEnum,
				resolve: (parent) => parent.token
			}),
			chain: t.field({
				type: WalletSchema.ChainEnum,
				resolve: (parent) => parent.chain
			}),
			status: t.field({
				type: EventStatusEnum,
				resolve: (parent) => parent.status
			}),
			createdAt: t.field({
				authScopes: { admin: true },
				type: "Date",
				resolve: (parent) => parent.created_at
			}),
			updatedAt: t.field({
				authScopes: { admin: true },
				type: "Date",
				resolve: (parent) => parent.updated_at
			})
		})
	});

const Source = builder.objectRef<EventService.Source>("Source").implement({
	fields: (t) => ({
		id: t.exposeInt("id"),
		name: t.exposeString("name"),
		url: t.exposeString("url"),
		eventId: t.exposeString("event_id"),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

const Option = builder.objectRef<EventService.Option>("Option").implement({
	fields: (t) => ({
		id: t.exposeInt("id"),
		name: t.exposeString("name"),
		imageUrl: t.exposeString("image_url", { nullable: true }),
		odds: t.exposeFloat("odds"),
		eventId: t.exposeString("event_id"),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

const Bet = builder.objectRef<EventService.Bet>("Bet").implement({
	fields: (t) => ({
		id: t.exposeString("id"),
		eventId: t.exposeString("event_id"),
		optionId: t.exposeInt("option_id"),
		userId: t.exposeString("user_id", { nullable: true }),
		pricePerQuantity: t.exposeFloat("price_per_quantity"),
		quantity: t.exposeInt("quantity"),
		rewardAmountUsed: t.exposeFloat("reward_amount_used"),
		unmatchedQuantity: t.exposeInt("unmatched_quantity"),
		type: t.field({
			type: BetTypeEnum,
			resolve: (parent) => parent.type
		}),
		buyBetId: t.exposeString("buy_bet_id", { nullable: true }),
		profit: t.exposeFloat("profit", { nullable: true }),
		platformCommission: t.exposeFloat("platform_commission", { nullable: true }),
		soldQuantity: t.exposeInt("sold_quantity", { nullable: true }),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

export { Category, Event, Option, Source, Bet };
