import { z } from "zod";
import { builder } from "../../config";
import { EventService, WalletService } from "../../service";

/**
 * This is a Zod schema for validating the payload when creating or updating a category.
 */
const CreateOrUpdateCategoryPayload = z.object({
	id: z.number().nullish(),
	name: z.string().max(255),
	description: z.string().nullish(),
	imageUrl: z.string().url().nullish()
});
type CreateOrUpdateCategoryPayload = z.infer<typeof CreateOrUpdateCategoryPayload>;

/**
 * This is a Zod schema for validating the payload when creating an event.
 */
const CreateEventPayload = z
	.object({
		name: z.string(),
		description: z.string().nullish(),
		info: z.string().nullish(),
		imageUrl: z.string().url().nullish(),
		startAt: z.date(),
		endAt: z.date(),
		freezeAt: z.date().nullish(),
		platformLiquidityLeft: z.number().min(0),
		minLiquidityPercentage: z.number().min(0).max(100),
		maxLiquidityPercentage: z.number().min(0).max(100),
		liquidityInBetween: z.boolean(),
		platformFeesPercentage: z.number().min(0).max(100),
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
	})
	.refine(({ minLiquidityPercentage, maxLiquidityPercentage }) => minLiquidityPercentage <= maxLiquidityPercentage, {
		message: "minLiquidityPercentage must be less than or equal to minLiquidityPercentage",
		path: ["minLiquidityPercentage", "maxLiquidityPercentage"]
	})
	.refine(({ freezeAt, endAt }) => !freezeAt || freezeAt < endAt, {
		message: "Freeze date must be less than end date",
		path: ["freezeAt", "endAt"]
	});

type CreateEventPayload = z.infer<typeof CreateEventPayload>;

/**
 * This is a Zod schema for validating the payload when updating an event.
 */
const UpdateEventPayload = z
	.object({
		id: z.string(),
		name: z.string(),
		description: z.string().nullish(),
		info: z.string().nullish(),
		imageUrl: z.string().url().nullish(),
		startAt: z.date(),
		endAt: z.date(),
		frozen: z.boolean(),
		freezeAt: z.date().nullish(),
		optionWon: z.number().nullish(),
		platformLiquidityLeft: z.number().min(0),
		minLiquidityPercentage: z.number().min(0).max(100),
		maxLiquidityPercentage: z.number().min(0).max(100),
		liquidityInBetween: z.boolean(),
		platformFeesPercentage: z.number().min(0).max(100),
		slippage: z.number().min(0)
	})
	.refine(({ startAt, endAt }) => startAt < endAt, {
		message: "Start date must be less than end date",
		path: ["startAt", "endAt"]
	})
	.refine(({ minLiquidityPercentage, maxLiquidityPercentage }) => minLiquidityPercentage <= maxLiquidityPercentage, {
		message: "minLiquidityPercentage must be less than or equal to minLiquidityPercentage",
		path: ["minLiquidityPercentage", "maxLiquidityPercentage"]
	})
	.refine(({ freezeAt, endAt }) => !freezeAt || freezeAt < endAt, {
		message: "Freeze date must be less than end date",
		path: ["freezeAt", "endAt"]
	});

type UpdateEventPayload = z.infer<typeof UpdateEventPayload>;

/**
 * This is a Zod schema for validating the input when updating an event source.
 */
const UpdateEventSourcePayload = z.object({
	id: z.number().int(),
	name: z.string(),
	url: z.string().url()
});
type UpdateEventSourcePayload = z.infer<typeof UpdateEventSourcePayload>;

/**
 * This is a Zod schema for validating the input when updating event options.
 */
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

/**
 * This is a Zod schema for validating the payload when getting events.
 */
const getEventsPayload = z
	.object({
		startAt: z.date().nullish(),
		endAt: z.date().nullish(),
		category: z.array(z.number()).min(1).nullish(),
		status: EventService.EventStatus.nullish(),
		search: z.string().nullish(),
		token: WalletService.Token.nullish(),
		chain: WalletService.Chain.nullish()
	})
	.refine(({ startAt, endAt }) => !startAt || !endAt || startAt < endAt, {
		message: "Start date must be less than end date",
		path: ["startAt", "endAt"]
	})
	.refine(({ token, chain }) => !token || !chain || WalletService.TokenCombination.some((item) => item.token === token && item.chain === chain), {
		message: "Invalid token and chain combination. Allowed combinations are: " + WalletService.TokenCombination.map((item) => `${item.token} - ${item.chain}`).join(", "),
		path: ["token", "chain"]
	});
type getEventsPayload = z.infer<typeof getEventsPayload>;

/**
 * This is a pothos input type for creating an event source.
 */
const CreateEventSourceInput = builder.inputType("CreateEventSourceInput", {
	fields: (t) => ({
		name: t.string({ required: true, description: "The name of the source" }),
		url: t.string({ required: true, description: "The URL of the source" })
	})
});

/**
 * This is a pothos input type for creating an event option.
 */
const CreateEventOptionInput = builder.inputType("CreateEventOptionInput", {
	fields: (t) => ({
		name: t.string({ required: true, description: "The name of the option" }),
		imageUrl: t.string({ description: "The URL of the option image" }),
		odds: t.float({ required: true, description: "The odds of the option" })
	})
});

/**
 * This is a pothos input type for updating an event option.
 */
const UpdateEventOptionInput = builder.inputType("UpdateOptionInput", {
	fields: (t) => ({
		id: t.int({ required: true, description: "The unique identifier of the option" }),
		name: t.string({ required: true, description: "The name of the option" }),
		imageUrl: t.string({ description: "The URL of the option image" }),
		odds: t.float({ required: true, description: "The odds of the option" })
	})
});

export {
	UpdateEventOptionPayload,
	CreateOrUpdateCategoryPayload,
	CreateEventPayload,
	UpdateEventSourcePayload,
	CreateEventOptionInput,
	CreateEventSourceInput,
	UpdateEventOptionInput,
	UpdateEventPayload,
	getEventsPayload
};
