import { builder } from "../../config";
import { BetService, UserService } from "../../service";
import { PlaceBetPayload } from "./input.ts";
import { Bet, BetTypeEnum } from "./object.ts";

builder.mutationField("placeBet", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || false,
		type: Bet,
		args: {
			eventId: t.arg.string({ required: true, description: "The unique identifier of the event the bet is placed on" }),
			optionId: t.arg.int({ required: true, description: "The unique identifier of the option the bet is placed on" }),
			price: t.arg.float({ description: "The price per quantity of the bet. Required for limit order" }),
			quantity: t.arg.int({ required: true, description: "The quantity of the bet" }),
			type: t.arg({
				type: BetTypeEnum,
				required: true,
				description: "The type of the bet. It can be either buy or sell"
			}),
			buyBetId: t.arg.string({
				description: "Buy bet id for sell bet. Must be present if the bet is a sell bet"
			})
		},
		validate: {
			schema: PlaceBetPayload
		},
		resolve: async (_, arg, { user }) => await BetService.placeBet((user as UserService.User).id, arg)
	})
);

export { PlaceBetPayload };
