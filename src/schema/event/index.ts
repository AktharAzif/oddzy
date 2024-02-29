import { z } from "zod";
import { builder, db } from "../../config";
import { EventService } from "../../service";
import { ChainEnum, TokenEnum } from "../wallet";
import {
	CreateEventOptionInput,
	CreateEventPayload,
	CreateEventSourceInput,
	CreateOrUpdateCategoryPayload,
	getEventsPayload,
	UpdateEventOptionInput,
	UpdateEventOptionPayload,
	UpdateEventPayload,
	UpdateEventSourcePayload
} from "./input";
import { Category, CategoryPaginatedResponse, Event, EventPaginatedResponse, EventStatusEnum, Option, Source } from "./object";

builder.queryField("category", (t) =>
	t.field({
		type: Category,
		args: {
			id: t.arg.int({ required: true, description: "The unique identifier of the category" })
		},
		resolve: async (_, { id }) => await EventService.getCategory(id),
		description: "Get a category by its unique identifier"
	})
);

builder.queryField("categories", (t) =>
	t.field({
		type: CategoryPaginatedResponse,
		args: {
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				validate: { min: 1 },
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				validate: { min: 1, max: 100 },
				description: "The limit of categories per page. Min 1, Max 100."
			})
		},
		resolve: async (_, { page, limit }) => await EventService.getCategories(page - 1, limit),
		description: "Get a list of categories"
	})
);

builder.queryField("options", (t) =>
	t.field({
		type: [Option],
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event" })
		},
		resolve: async (_, { eventId }) => await EventService.getEventOptions(eventId),
		description: "Get a list of options for an event"
	})
);

builder.queryField("sources", (t) =>
	t.field({
		type: [Source],
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event" })
		},
		resolve: async (_, { eventId }) => await EventService.getEventSources(eventId),
		description: "Get a list of sources for an event"
	})
);

//Add a single source

builder.queryField("eventCategories", (t) =>
	t.field({
		type: [Category],
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event" })
		},
		resolve: async (_, { eventId }) => await EventService.getEventCategories(eventId),
		description: "Get a list of categories for an event"
	})
);

builder.mutationField("createOrUpdateCategory", (t) =>
	t.field({
		type: Category,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({
				description: "The unique identifier of the category. If not provided, a new category will be created."
			}),
			name: t.arg.string({
				required: true,
				description: "The name of the category"
			}),
			description: t.arg.string({
				description: "The description of the category"
			}),
			imageUrl: t.arg.string({
				description: "The URL of the category image"
			})
		},
		validate: {
			schema: CreateOrUpdateCategoryPayload
		},
		resolve: async (_, arg) => await EventService.createOrUpdateCategory(arg),
		description: "Create or update a category. Only accessible to admin."
	})
);

builder.mutationField("deleteCategory", (t) =>
	t.field({
		type: Category,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({
				required: true,
				description: "The unique identifier of the category"
			})
		},
		resolve: async (_, { id }) => await EventService.deleteCategory(id),
		description: "Delete a category by its unique identifier. Only accessible to admin."
	})
);

builder.mutationField("createEvent", (t) =>
	t.field({
		type: Event,
		authScopes: { admin: true },
		args: {
			name: t.arg.string({
				required: true,
				description: "The name of the event"
			}),
			description: t.arg.string({
				description: "The description of the event"
			}),
			info: t.arg.string({
				description: "The info regarding the event betting options"
			}),
			imageUrl: t.arg.string({
				description: "The URL of the event banner image"
			}),
			startAt: t.arg({
				type: "Date",
				required: true,
				description: "The start date and time of the event"
			}),
			endAt: t.arg({
				type: "Date",
				required: true,
				description: "The end date and time of the event"
			}),
			freezeAt: t.arg({
				type: "Date",
				description: "The date and time when the event will be frozen"
			}),
			platformLiquidityLeft: t.arg.float({
				required: true,
				description: "The liquidity left on the platform for auto matching"
			}),
			minLiquidityPercentage: t.arg.float({
				required: true,
				description: "The minimum liquidity percentage required for auto matching"
			}),
			maxLiquidityPercentage: t.arg.float({
				required: true,
				description: "The maximum liquidity percentage required for auto matching"
			}),
			liquidityInBetween: t.arg.boolean({
				required: true,
				description: "If true, auto matching will be done between min and max liquidity percentage"
			}),
			platformFeesPercentage: t.arg.float({ required: true, description: "The platform fees percentage for profits" }),
			winPrice: t.arg.float({ required: true, description: "The price of the winning option" }),
			slippage: t.arg.float({ required: true, description: "The slippage value for auto matching" }),
			token: t.arg({
				type: TokenEnum,
				required: true,
				description: "The token in which the event is to be created"
			}),
			chain: t.arg({
				type: ChainEnum,
				required: true,
				description: "The chain in which the event is to be created"
			}),
			category: t.arg.intList({ required: true, description: "List of category ids" }),
			option: t.arg({
				type: [CreateEventOptionInput],
				required: true,
				description: "The options for the event"
			}),
			source: t.arg({
				type: [CreateEventSourceInput],
				required: true,
				description: "The sources for the event"
			})
		},
		validate: {
			schema: CreateEventPayload
		},
		resolve: async (_, arg) => await EventService.createEvent(arg),
		description: "Create an event. Only accessible to admin."
	})
);

builder.mutationField("updateSource", (t) =>
	t.field({
		type: Source,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({ required: true, description: "The unique identifier of the source" }),
			name: t.arg.string({ required: true, description: "The name of the source" }),
			url: t.arg.string({ required: true, description: "The URL of the source" })
		},
		validate: {
			schema: UpdateEventSourcePayload
		},
		resolve: async (_, arg) => await EventService.updateSource(arg),
		description: "Update a source. Only accessible to admin."
	})
);

builder.mutationField("deleteSource", (t) =>
	t.field({
		type: Source,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({ required: true, description: "The unique identifier of the source" })
		},
		resolve: async (_, { id }) => await EventService.deleteSource(id),
		description: "Delete a source by its unique identifier. Only accessible to admin."
	})
);

builder.mutationField("updateOptions", (t) =>
	t.field({
		type: [Option],
		authScopes: { admin: true },
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event" }),
			option: t.arg({
				type: [UpdateEventOptionInput],
				required: true,
				description: "The options to be updated"
			})
		},
		validate: {
			schema: UpdateEventOptionPayload
		},
		resolve: async (_, args) => await EventService.updateOptions(args),
		description: "Update options for an event. Only accessible to admin."
	})
);

builder.queryField("source", (t) =>
	t.field({
		type: Source,
		args: {
			id: t.arg.int({ required: true, description: "The unique identifier of the source" })
		},
		resolve: async (_, { id }) => await EventService.getSource(id),
		description: "Get a source by its unique identifier"
	})
);

builder.queryField("event", (t) =>
	t.field({
		type: Event,
		args: {
			id: t.arg.string({ required: true, description: "The unique identifier of the event" })
		},
		resolve: async (_, { id }) => await EventService.getEvent(db.sql, id),
		description: "Get an event by its unique identifier"
	})
);

builder.queryField("events", (t) =>
	t.field({
		type: EventPaginatedResponse,
		args: {
			startAt: t.arg({
				type: "Date",
				description: "The start date and time of the event"
			}),
			endAt: t.arg({
				type: "Date",
				description: "The end date and time of the event"
			}),
			category: t.arg.intList({ description: "List of category ids" }),
			status: t.arg({
				type: EventStatusEnum,
				description: "The status of the event"
			}),
			search: t.arg.string({ description: "The search string" }),
			token: t.arg({
				type: TokenEnum,
				description: "The token in which the event is to be fetched"
			}),
			chain: t.arg({
				type: ChainEnum,
				description: "The chain in which the event is to be fetched"
			}),
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				description: "The limit of events per page. Min 1, Max 100."
			})
		},
		validate: {
			schema: z.intersection(getEventsPayload, z.object({ page: z.number().min(1), limit: z.number().min(1).max(100) }))
		},
		resolve: async (_, { page, limit, ...args }) => await EventService.getEvents(args, page - 1, limit),
		description: "Get a list of events"
	})
);

builder.mutationField("updateEventCategories", (t) =>
	t.field({
		type: "Boolean",
		authScopes: { admin: true },
		args: {
			id: t.arg.string({ required: true, description: "The unique identifier of the event" }),
			categories: t.arg.intList({ required: true, description: "List of category ids" })
		},
		resolve: async (_, { id, categories }) => {
			await EventService.updateEventCategories(id, categories);
			return true;
		},
		description: "Update categories for an event. Only accessible to admin."
	})
);

builder.mutationField("updateEvent", (t) =>
	t.field({
		type: Event,
		authScopes: { admin: true },
		args: {
			id: t.arg.string({ required: true, description: "The unique identifier of the event" }),
			name: t.arg.string({
				required: true,
				description: "The name of the event"
			}),
			description: t.arg.string({
				description: "The description of the event"
			}),
			info: t.arg.string({
				description: "The info regarding the event betting options"
			}),
			imageUrl: t.arg.string({
				description: "The URL of the event banner image"
			}),
			startAt: t.arg({
				type: "Date",
				required: true,
				description: "The start date and time of the event"
			}),
			endAt: t.arg({
				type: "Date",
				required: true,
				description: "The end date and time of the event"
			}),
			frozen: t.arg.boolean({
				required: true,
				description: "The status of the event"
			}),
			freezeAt: t.arg({
				type: "Date",
				description: "The date and time when the event will be frozen"
			}),
			optionWon: t.arg.int({
				description: "The option id which won"
			}),
			platformLiquidityLeft: t.arg.float({
				required: true,
				description: "The liquidity left on the platform for auto matching"
			}),
			minLiquidityPercentage: t.arg.float({
				required: true,
				description: "The minimum liquidity percentage required for auto matching"
			}),
			maxLiquidityPercentage: t.arg.float({
				required: true,
				description: "The maximum liquidity percentage required for auto matching"
			}),
			liquidityInBetween: t.arg.boolean({
				required: true,
				description: "If true, auto matching will be done between min and max liquidity percentage"
			}),
			platformFeesPercentage: t.arg.float({ required: true, description: "The platform fees percentage for profits" }),
			slippage: t.arg.float({ required: true, description: "The slippage value for auto matching" })
		},
		validate: {
			schema: UpdateEventPayload
		},
		resolve: async (_, arg) => await EventService.updateEvent(arg),
		description: "Update an event. Only accessible to admin."
	})
);

export type {
	CreateEventPayload,
	CreateOrUpdateCategoryPayload,
	UpdateEventOptionPayload,
	UpdateEventSourcePayload,
	getEventsPayload,
	CategoryPaginatedResponse,
	EventPaginatedResponse,
	UpdateEventPayload
};
