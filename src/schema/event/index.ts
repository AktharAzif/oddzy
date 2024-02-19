import { builder } from "../../config";
import { EventService } from "../../service";
import { getPagination } from "../../util";
import { ChainEnum, TokenEnum } from "../wallet";
import { BetTypeEnum } from "./enum.ts";
import {
	CreateEventOptionInput,
	CreateEventPayload,
	CreateEventSourceInput,
	CreateOrUpdateCategoryPayload,
	PlaceBetPayload,
	UpdateEventOptionInput,
	UpdateEventOptionPayload,
	UpdateEventSourcePayload
} from "./input";
import { Bet, Category, Event, Option, Source } from "./object";

builder.queryField("getCategory", (t) =>
	t.field({
		type: Category,
		args: {
			id: t.arg.int({ required: true })
		},
		resolve: async (_, { id }) => await EventService.getCategory(id)
	})
);

builder.queryField("getCategories", (t) =>
	t.field({
		type: [Category],
		args: {
			page: t.arg.int({ required: true, defaultValue: 1 }),
			limit: t.arg.int({ required: true, defaultValue: 20 })
		},
		resolve: async (_, args) => {
			const { page, limit } = getPagination(args.page, args.limit);
			return await EventService.getCategories(page, limit);
		}
	})
);

builder.queryField("getEventOptions", (t) =>
	t.field({
		type: [Option],
		args: {
			eventId: t.arg.string({ required: true })
		},
		resolve: async (_, { eventId }) => await EventService.getEventOptions(eventId)
	})
);

builder.queryField("getEventSources", (t) =>
	t.field({
		type: [Source],
		args: {
			eventId: t.arg.string({ required: true })
		},
		resolve: async (_, { eventId }) => await EventService.getEventSources(eventId)
	})
);

builder.queryField("getEventCategories", (t) =>
	t.field({
		type: [Category],
		args: {
			eventId: t.arg.string({ required: true })
		},
		resolve: async (_, { eventId }) => await EventService.getEventCategories(eventId)
	})
);

builder.mutationField("createOrUpdateCategory", (t) =>
	t.field({
		type: Category,
		authScopes: { admin: true },
		args: {
			id: t.arg.int(),
			name: t.arg.string({
				required: true
			}),
			description: t.arg.string(),
			imageUrl: t.arg.string()
		},
		validate: {
			schema: CreateOrUpdateCategoryPayload
		},
		resolve: async (_, arg) => await EventService.createOrUpdateCategory(arg)
	})
);

builder.mutationField("deleteCategory", (t) =>
	t.field({
		type: Category,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({
				required: true
			})
		},
		resolve: async (_, { id }) => await EventService.deleteCategory(id)
	})
);

builder.mutationField("createEvent", (t) =>
	t.field({
		type: Event,
		authScopes: { admin: true },
		args: {
			name: t.arg.string({
				required: true
			}),
			description: t.arg.string(),
			info: t.arg.string(),
			imageUrl: t.arg.string(),
			startAt: t.arg({
				type: "Date",
				required: true
			}),
			endAt: t.arg({
				type: "Date",
				required: true
			}),
			platformLiquidityLeft: t.arg.float({ required: true }),
			minLiquidityPercentage: t.arg.float({ required: true }),
			maxLiquidityPercentage: t.arg.float({ required: true }),
			liquidityInBetween: t.arg.boolean({ required: true }),
			platformFeesPercentage: t.arg.float({ required: true }),
			winPrice: t.arg.float({ required: true }),
			slippage: t.arg.float({ required: true }),
			token: t.arg({
				type: TokenEnum,
				required: true
			}),
			chain: t.arg({
				type: ChainEnum,
				required: true
			}),
			category: t.arg.intList({ required: true }),
			option: t.arg({
				type: [CreateEventOptionInput],
				required: true
			}),
			source: t.arg({
				type: [CreateEventSourceInput],
				required: true
			})
		},
		validate: {
			schema: CreateEventPayload
		},
		resolve: async (_, arg) => await EventService.createEvent(arg)
	})
);

builder.mutationField("updateSource", (t) =>
	t.field({
		type: Source,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({ required: true }),
			name: t.arg.string({ required: true }),
			url: t.arg.string({ required: true })
		},
		validate: {
			schema: UpdateEventSourcePayload
		},
		resolve: async (_, arg) => await EventService.updateSource(arg)
	})
);

builder.mutationField("deleteSource", (t) =>
	t.field({
		type: Source,
		authScopes: { admin: true },
		args: {
			id: t.arg.int({ required: true })
		},
		resolve: async (_, { id }) => await EventService.deleteSource(id)
	})
);

builder.mutationField("updateOptions", (t) =>
	t.field({
		type: [Option],
		authScopes: { admin: true },
		args: {
			eventId: t.arg.string({ required: true }),
			option: t.arg({
				type: [UpdateEventOptionInput],
				required: true
			})
		},
		validate: {
			schema: UpdateEventOptionPayload
		},
		resolve: async (_, args) => await EventService.updateOptions(args)
	})
);

builder.mutationField("placeBet", (t) =>
	t.field({
		type: Bet,
		args: {
			eventId: t.arg.string({ required: true }),
			optionId: t.arg.int({ required: true }),
			price: t.arg.float({ required: true }),
			quantity: t.arg.int({ required: true }),
			type: t.arg({
				type: BetTypeEnum,
				required: true
			}),
			buyBetId: t.arg.string()
		},
		validate: {
			schema: PlaceBetPayload
		},
		resolve: async (_, arg) => await EventService.placeBet("b7g7cy6louugeskg4svis6kj", arg)
	})
);

export type { CreateEventPayload, CreateOrUpdateCategoryPayload, UpdateEventOptionPayload, UpdateEventSourcePayload, PlaceBetPayload };
