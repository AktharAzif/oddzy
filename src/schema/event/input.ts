import { z } from "zod";
import { builder } from "../../config";
import { WalletService } from "../../service";

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
		platformLiquidityLeft: z.number(),
		minLiquidityPercentage: z.number(),
		maxLiquidityPercentage: z.number(),
		liquidityInBetween: z.boolean(),
		platformFeesPercentage: z.number(),
		winPrice: z.number(),
		slippage: z.number(),
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
					message: "Odds must add up to 100"
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
		message: "Start date must be less than end date"
	})
	.refine(({ token, chain }) => WalletService.TokenCombination.some((item) => item.token === token && item.chain === chain), {
		message: "Invalid token and chain combination. Allowed combinations are: " + WalletService.TokenCombination.map((item) => `${item.token} - ${item.chain}`).join(", ")
	});
type CreateEventPayload = z.infer<typeof CreateEventPayload>;

const UpdateEventSourcePayload = z.object({
	id: z.number(),
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
				id: z.number(),
				name: z.string(),
				imageUrl: z.string().url().nullish(),
				odds: z.number().min(0).max(100)
			})
		)
		.length(2)
		.refine((option) => option.reduce((acc, curr) => acc + curr.odds, 0) === 100, {
			message: "Odds must be between 0 and 100"
		})
});
type UpdateEventOptionPayload = z.infer<typeof UpdateEventOptionPayload>;

export { CreateEventOptionInput, CreateEventSourceInput, UpdateEventOptionInput, UpdateEventOptionPayload, CreateOrUpdateCategoryPayload, CreateEventPayload, UpdateEventSourcePayload };
