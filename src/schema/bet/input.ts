import { z } from "zod";
import { BetService, UserService, WalletService } from "../../service";

/**
 * This is a Zod schema for validating the payload when placing a bet.
 */
const PlaceBetPayload = z
	.object({
		eventId: z.string(),
		optionId: z.number().int(),
		price: z.number().positive().nullish(),
		quantity: z.number().int().min(1),
		type: BetService.BetType,
		buyBetId: z.string().nullish(),
		referredBy: z.string().nullish()
	})
	.refine(({ type, buyBetId }) => !(type === "sell" && !buyBetId), {
		message: "buyBetId is required for sell bet",
		path: ["buyBetId"]
	})
	.refine(
		async ({ referredBy }) => {
			if (referredBy) {
				const userId = await UserService.getUser(referredBy).catch(() => null);
				return !!userId;
			}
			return true;
		},
		{
			message: "invalid referredBy",
			path: ["referredBy"]
		}
	);

type PlaceBetPayload = z.infer<typeof PlaceBetPayload>;

const GetBetsPayload = z.object({
	eventId: z.string().nullish(),
	status: BetService.BetStatus.nullish(),
	filter: UserService.TimeFilter.nullish(),
	type: BetService.BetType.nullish(),
	token: WalletService.Token.nullish(),
	chain: WalletService.Chain.nullish()
});

type GetBetsPayload = z.infer<typeof GetBetsPayload>;

export { PlaceBetPayload, GetBetsPayload };
