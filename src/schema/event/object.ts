import { WalletSchema } from "..";
import { builder, db } from "../../config";
import { EventService } from "../../service";

const EventStatusEnum = builder.enumType("EventStatusEnum", {
	values: EventService.EventStatus.options,
	description: "The status of the event"
});

const Category = builder.objectRef<EventService.Category>("Category");
Category.implement({
	fields: (t) => ({
		id: t.exposeInt("id", {
			description: "The unique identifier of the category"
		}),
		name: t.exposeString("name", {
			description: "The name of the category"
		}),
		description: t.exposeString("description", { nullable: true, description: "The description of the category" }),
		imageUrl: t.exposeString("imageUrl", { nullable: true, description: "The URL of the category image" }),
		events: t.field({
			type: EventPaginatedResponse,
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
					description: "The limit of events per page. Min 1, Max 100.",
					validate: { min: 1, max: 100 }
				})
			},
			resolve: async (parent, { page, limit }) =>
				await EventService.getEvents(
					{
						category: [parent.id]
					},
					page - 1,
					limit
				),
			description: "The events in the category"
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time the category was created. This field is only accessible to admin"
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time the category was last updated. This field is only accessible to admin"
		})
	}),
	description: "The category response object."
});

const CategoryPaginatedResponse = builder.objectRef<{
	categories: EventService.Category[];
	total: number;
	page: number;
	limit: number;
}>("CategoryPaginatedResponse");

CategoryPaginatedResponse.implement({
	fields: (t) => ({
		categories: t.field({
			type: [Category],
			resolve: (parent) => parent.categories,
			description: "The categories"
		}),
		total: t.exposeInt("total", {
			description: "The total number of categories"
		}),
		page: t.exposeInt("page", {
			description: "Current page number"
		}),
		limit: t.exposeInt("limit", {
			description: "The limit of categories per page"
		})
	}),
	description: "The paginated category response object."
});
type CategoryPaginatedResponse = typeof CategoryPaginatedResponse.$inferType;

const Event = builder.objectRef<
	EventService.Event & {
		categories?: EventService.Category[];
		options?: EventService.Option[];
		sources?: EventService.Source[];
	}
>("Event");

Event.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the event"
		}),
		name: t.exposeString("name", {
			description: "The name of the event"
		}),
		description: t.exposeString("description", {
			nullable: true,
			description: "The description of the event"
		}),
		info: t.exposeString("info", { nullable: true, description: "The info regarding the event betting options" }),
		imageUrl: t.exposeString("imageUrl", { nullable: true, description: "The URL of the event banner image" }),
		startAt: t.field({
			type: "Date",
			resolve: (parent) => parent.startAt,
			description: "The date and time when the event will start"
		}),
		endAt: t.field({
			type: "Date",
			resolve: (parent) => parent.endAt,
			description: "The date and time when the event will end"
		}),
		frozen: t.exposeBoolean("frozen", {
			description: "If true, the event is frozen and no bets can be placed"
		}),
		freezeAt: t.field({
			type: "Date",
			resolve: (parent) => parent.freezeAt,
			nullable: true,
			description: "The date and time when the event was frozen or scheduled to be frozen"
		}),
		optionWon: t.exposeInt("optionWon", { nullable: true, description: "The winning option id of the event" }),
		platformLiquidityLeft: t.exposeFloat("platformLiquidityLeft", {
			description: "The liquidity left in the platform for auto matching",
			authScopes: { admin: true }
		}),
		minLiquidityPercentage: t.exposeFloat("minLiquidityPercentage", {
			description: "The minimum liquidity percentage required for auto matching",
			authScopes: { admin: true }
		}),
		maxLiquidityPercentage: t.exposeFloat("maxLiquidityPercentage", {
			description: "The maximum liquidity percentage for auto matching",
			authScopes: { admin: true }
		}),
		liquidityInBetween: t.exposeBoolean("liquidityInBetween", {
			description: "If true, auto matching will be done between min and max liquidity percentage",
			authScopes: { admin: true }
		}),
		platformFeesPercentage: t.exposeFloat("platformFeesPercentage", {
			description: "The platform fees percentage for profits"
		}),
		winPrice: t.exposeFloat("winPrice", {
			description: "The price of winning option"
		}),
		slippage: t.exposeFloat("slippage", {
			description: "The slippage value for auto matching"
		}),
		categories: t.field({
			type: [Category],
			resolve: async (parent) => parent.categories || (await EventService.getEventCategories(parent.id)),
			description: "The category of the event"
		}),
		options: t.field({
			type: [Option],
			resolve: async (parent) => parent.options || (await EventService.getEventOptions(parent.id)),
			description: "The options of the event"
		}),
		sources: t.field({
			type: [Source],
			resolve: async (parent) => parent.sources || (await EventService.getEventSources(parent.id)),
			description: "The sources of the event"
		}),
		token: t.field({
			type: WalletSchema.TokenEnum,
			resolve: (parent) => parent.token,
			description: "The token in which the user can place bets"
		}),
		chain: t.field({
			type: WalletSchema.ChainEnum,
			resolve: (parent) => parent.chain,
			description: "The chain in which the token is used"
		}),
		status: t.field({
			type: EventStatusEnum,
			resolve: (parent) => parent.status,
			description: "The status of the event"
		}),
		resolved: t.exposeBoolean("resolved", {
			authScopes: { admin: true },
			description: "If true, the payouts have been done. Only the admin can access this field."
		}),
		resolvedAt: t.field({
			type: "Date",
			authScopes: { admin: true },
			resolve: (parent) => parent.resolvedAt,
			nullable: true,
			description: "The date and time when the event was resolved. Only the admin can access this field."
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the event was created. Only the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the event was last updated. Only the admin can access this field."
		})
	}),
	description: "The event response object."
});

const Source = builder.objectRef<EventService.Source>("Source");
Source.implement({
	fields: (t) => ({
		id: t.exposeInt("id", {
			description: "The unique identifier of the source"
		}),
		name: t.exposeString("name", {
			description: "The name of the source"
		}),
		url: t.exposeString("url", {
			description: "The URL of the source"
		}),
		eventId: t.exposeString("eventId", {
			description: "The unique identifier of the event"
		}),
		event: t.field({
			type: Event,
			resolve: async (parent) => await EventService.getEvent(db.sql, parent.eventId),
			description: "The event in which the source is present"
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the source was created. Only the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the source was last updated. Only the admin can access this field."
		})
	})
});

const Option = builder.objectRef<EventService.Option>("Option");

Option.implement({
	fields: (t) => ({
		id: t.exposeInt("id", {
			description: "The unique identifier of the option"
		}),
		name: t.exposeString("name", {
			description: "The name of the option"
		}),
		imageUrl: t.exposeString("imageUrl", { nullable: true, description: "The URL of the option image" }),
		odds: t.exposeFloat("odds", {
			description: "The odds of the option"
		}),
		price: t.exposeFloat("price", {
			description: "The price of the option"
		}),
		eventId: t.exposeString("eventId", {
			description: "The unique identifier of the event"
		}),
		event: t.field({
			type: Event,
			resolve: async (parent) => await EventService.getEvent(db.sql, parent.eventId),
			description: "The event in which the option is present"
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the option was created. Only the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the option was last updated. Only the admin can access this field."
		})
	}),
	description: "The option response object."
});

const EventPaginatedResponse = builder.objectRef<{
	events: EventService.Event[];
	total: number;
	page: number;
	limit: number;
}>("EventPaginatedResponse");

EventPaginatedResponse.implement({
	fields: (t) => ({
		events: t.field({
			type: [Event],
			resolve: (parent) => parent.events,
			description: "The events"
		}),
		total: t.exposeInt("total", {
			description: "The total number of events"
		}),
		page: t.exposeInt("page", {
			description: "Current page number"
		}),
		limit: t.exposeInt("limit", {
			description: "The limit of events per page"
		})
	}),
	description: "The paginated event response object."
});
type EventPaginatedResponse = typeof EventPaginatedResponse.$inferType;

export { Category, EventStatusEnum, Event, Option, Source, EventPaginatedResponse, CategoryPaginatedResponse };
