import { z } from "zod";
import { builder } from "../../config";
import { EventService, WalletService } from "../../service";

const CreateOrUpdateCategoryPayload = z.object({
	id: z.number().nullish(),
	name: z.string().max(255),
	description: z.string().nullish(),
	imageUrl: z.string().url().nullish()
});
type CreateOrUpdateCategoryPayload = z.infer<typeof CreateOrUpdateCategoryPayload>;

const CreateEventSourceInput = builder.inputType("CreateEventSourceInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		url: t.string({ required: true })
	})
});

const CreateEventOptionInput = builder.inputType("CreateEventOptionInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		imageUrl: t.string(),
		odds: t.float({ required: true })
	})
});

const CreateEventPayload = z
	.object({
		name: z.string(),
		description: z.string().nullish(),
		info: z.string().nullish(),
		imageUrl: z.string().nullish(),
		startAt: z.date(),
		endAt: z.date(),
		platformLiquidityLeft: z.number().min(0),
		minLiquidityPercentage: z.number().min(0),
		maxLiquidityPercentage: z.number().min(0),
		liquidityInBetween: z.boolean(),
		platformFeesPercentage: z.number().min(0),
		winPrice: z.number().positive(),
		slippage: z.number().min(0),
		token: WalletService.Token,
		chain: WalletService.Chain,
		category: z.array(z.number()),
		option: z
			.array(
				z.object({
					name: z.string(),
					imageUrl: z.string().url().nullish(),
					odds: z.number().min(0).max(100)
				})
			)
			.length(2)
			.refine(
				(option) => {
					return option.reduce((acc, curr) => acc + curr.odds, 0) === 100;
				},
				{
					message: "Odds must add up to 100",
					path: ["option"]
				}
			),
		source: z.array(
			z.object({
				name: z.string(),
				url: z.string().url()
			})
		)
	})
	.refine(({ startAt, endAt }) => startAt < endAt, {
		message: "Start date must be less than end date",
		path: ["startAt", "endAt"]
	})
	.refine(({ token, chain }) => WalletService.TokenCombination.some((item) => item.token === token && item.chain === chain), {
		message: "Invalid token and chain combination. Allowed combinations are: " + WalletService.TokenCombination.map((item) => `${item.token} - ${item.chain}`).join(", "),
		path: ["token", "chain"]
	});
type CreateEventPayload = z.infer<typeof CreateEventPayload>;

const UpdateEventSourcePayload = z.object({
	id: z.number().int(),
	name: z.string(),
	url: z.string().url()
});
type UpdateEventSourcePayload = z.infer<typeof UpdateEventSourcePayload>;

const UpdateEventOptionInput = builder.inputType("UpdateOptionInput", {
	fields: (t) => ({
		id: t.int({ required: true }),
		name: t.string({ required: true }),
		imageUrl: t.string(),
		odds: t.float({ required: true })
	})
});

const UpdateEventOptionPayload = z.object({
	eventId: z.string(),
	option: z
		.array(
			z.object({
				id: z.number().int(),
				name: z.string(),
				imageUrl: z.string().url().nullish(),
				odds: z.number().min(0).max(100)
			})
		)
		.length(2)
		.refine((option) => option.reduce((acc, curr) => acc + curr.odds, 0) === 100, {
			message: "Odds must add up to 100",
			path: ["option"]
		})
});
type UpdateEventOptionPayload = z.infer<typeof UpdateEventOptionPayload>;

const PlaceBetPayload = z
	.object({
		eventId: z.string(),
		optionId: z.number().int(),
		price: z.number().positive(),
		quantity: z.number().int().min(1),
		type: EventService.BetType,
		buyBetId: z.string().nullish()
	})
	.refine(({ type, buyBetId }) => !(type === "sell" && !buyBetId), {
		message: "buyBetId is required for sell bet",
		path: ["buyBetId"]
	});
type PlaceBetPayload = z.infer<typeof PlaceBetPayload>;

export {
	CreateEventOptionInput,
	CreateEventSourceInput,
	UpdateEventOptionInput,
	UpdateEventOptionPayload,
	CreateOrUpdateCategoryPayload,
	CreateEventPayload,
	UpdateEventSourcePayload,
	PlaceBetPayload
};
