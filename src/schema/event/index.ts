import { builder } from "../../config";
import { EventService } from "../../service";
import { getPagination } from "../../util";
import { ChainEnum, TokenEnum } from "../wallet/enum";
import { EventStatusEnum } from "./enum";
import { EventOptionInput, EventSourceInput, type CreateEventInput, type CreateOrUpdateCategoryInput, type UpdateSouceInput } from "./input";
import { Category, Source } from "./object";

builder.queryField("category", (t) =>
	t.field({
		type: Category,
		args: {
			id: t.arg.int({ required: true })
		},
		resolve: async (_, { id }) => await EventService.getCategory(id)
	})
);

builder.queryField("categories", (t) =>
	t.field({
		type: [Category],
		args: {
			page: t.arg.int({ required: true }),
			limit: t.arg.int({ required: true })
		},
		resolve: async (_, args) => {
			const { page, limit } = getPagination(args.page, args.limit);
			return await EventService.getCategories(page, limit);
		}
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
		type: "Boolean",
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
			frozen: t.arg.boolean({ required: true }),
			platformLiquidity: t.arg.float({ required: true }),
			minLiquidityPercentage: t.arg.float({ required: true }),
			maxLiquidityPercentage: t.arg.float({ required: true }),
			liquidityInBetween: t.arg.boolean({ required: true }),
			platformFeesPercentage: t.arg.float({ required: true }),
			winPrice: t.arg.float({ required: true }),
			slippage: t.arg.float({ required: true }),
			limitOrderEnabled: t.arg.boolean({ required: true }),
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
				type: [EventOptionInput],
				required: true
			}),
			source: t.arg({
				type: [EventSourceInput],
				required: true
			})
		},
		resolve: async (_, arg) => {
			console.log(await EventService.createEvent(arg));
			return true;
		}
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

export { EventStatusEnum };

export type { CreateEventInput, CreateOrUpdateCategoryInput, UpdateSouceInput };
