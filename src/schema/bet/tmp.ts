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


//
// const CancelBetPayload = z.object({
// 	id: z.string(),
// 	eventId: z.string(),
// 	quantity: z.number().int().min(1)
// });
// type CancelBetPayload = z.infer<typeof CancelBetPayload>;

