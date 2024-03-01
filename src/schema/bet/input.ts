import { z } from "zod";
import { BetService } from "../../service";

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
		buyBetId: z.string().nullish()
	})
	.refine(({ type, buyBetId }) => !(type === "sell" && !buyBetId), {
		message: "buyBetId is required for sell bet",
		path: ["buyBetId"]
	});
type PlaceBetPayload = z.infer<typeof PlaceBetPayload>;

export { PlaceBetPayload };
