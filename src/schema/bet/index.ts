// builder.mutationField("placeBet", (t) =>
// 	t.field({
// 		type: Bet,
// 		args: {
// 			eventId: t.arg.string({ required: true }),
// 			optionId: t.arg.int({ required: true }),
// 			price: t.arg.float({ required: true }),
// 			quantity: t.arg.int({ required: true }),
// 			type: t.arg({
// 				type: BetTypeEnum,
// 				required: true
// 			}),
// 			buyBetId: t.arg.string()
// 		},
// 		validate: {
// 			schema: PlaceBetPayload
// 		},
// 		resolve: async (_, arg) => await BetService.placeBet("b7g7cy6louugeskg4svis6ku", arg)
// 	})
// );
//
// builder.mutationField("cancelBet", (t) =>
// 	t.field({
// 		type: Bet,
// 		args: {
// 			id: t.arg.string({ required: true }),
// 			quantity: t.arg.int({ required: true }),
// 			eventId: t.arg.string({ required: true })
// 		},
// 		validate: {
// 			schema: CancelBetPayload
// 		},
// 		resolve: async (_, arg) => await BetService.cancelBet("b7g7cy6louugeskg4svis6ku", arg)
// 	})
// );

//
// import { builder } from "../../config";
// import { BetService } from "../../service";
//
// const BetTypeEnum = builder.enumType("BetTypeEnum", {
// 	values: BetService.BetType.options
// });

//
// import { z } from "zod";
// import { EventService } from "../../service";
//
// const PlaceBetPayload = z
// 	.object({
// 		eventId: z.string(),
// 		optionId: z.number().int(),
// 		price: z.number().positive(),
// 		quantity: z.number().int().min(1),
// 		type: EventService.BetType,
// 		buyBetId: z.string().nullish()
// 	})
// 	.refine(({ type, buyBetId }) => !(type === "sell" && !buyBetId), {
// 		message: "buyBetId is required for sell bet",
// 		path: ["buyBetId"]
// 	});
// type PlaceBetPayload = z.infer<typeof PlaceBetPayload>;
//
// const CancelBetPayload = z.object({
// 	id: z.string(),
// 	eventId: z.string(),
// 	quantity: z.number().int().min(1)
// });
// type CancelBetPayload = z.infer<typeof CancelBetPayload>;

// const Bet = builder.objectRef<BetService.Bet>("Bet").implement({
// 	fields: (t) => ({
// 		id: t.exposeString("id"),
// 		eventId: t.exposeString("eventId"),
// 		optionId: t.exposeInt("optionId"),
// 		userId: t.exposeString("userId", { nullable: true }),
// 		pricePerQuantity: t.exposeFloat("pricePerQuantity"),
// 		quantity: t.exposeInt("quantity"),
// 		rewardAmountUsed: t.exposeFloat("rewardAmountUsed", {
// 			authScopes: { admin: true }
// 		}),
// 		unmatchedQuantity: t.exposeInt("unmatchedQuantity"),
// 		type: t.field({
// 			type: BetTypeEnum,
// 			resolve: (parent) => parent.type
// 		}),
// 		buyBetId: t.exposeString("buyBetId", { nullable: true }),
// 		profit: t.exposeFloat("profit", { nullable: true }),
// 		platformCommission: t.exposeFloat("platformCommission", { nullable: true }),
// 		soldQuantity: t.exposeInt("soldQuantity", { nullable: true }),
// 		createdAt: t.field({
// 			authScopes: { admin: true },
// 			type: "Date",
// 			resolve: (parent) => parent.createdAt
// 		}),
// 		updatedAt: t.field({
// 			authScopes: { admin: true },
// 			type: "Date",
// 			resolve: (parent) => parent.updatedAt
// 		})
// 	})
// });