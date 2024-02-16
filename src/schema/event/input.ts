import { builder } from "../../config";
import { ChainEnum, TokenEnum } from "../wallet";

const EventSourceInput = builder.inputType("SourceInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		url: t.string({ required: true })
	})
});

const EventOptionInput = builder.inputType("OptionInput", {
	fields: (t) => ({
		name: t.string({ required: true }),
		imageUrl: t.string(),
		odds: t.float({ required: true })
	})
});

type EventSourceInput = typeof EventSourceInput.$inferInput;
type EventOptionInput = typeof EventOptionInput.$inferInput;

type CreateEventInput = {
	name: string;
	description?: string | null;
	info?: string | null;
	imageUrl?: string | null;
	startAt: Date;
	endAt: Date;
	frozen: boolean;
	platformLiquidity: number;
	minLiquidityPercentage: number;
	maxLiquidityPercentage: number;
	liquidityInBetween: boolean;
	platformFeesPercentage: number;
	winPrice: number;
	slippage: number;
	limitOrderEnabled: boolean;
	token: TokenEnum;
	chain: ChainEnum;
	category: number[];
	option: EventOptionInput[];
	source: EventSourceInput[];
};

type CreateOrUpdateCategoryInput = {
	id?: number | null;
	name: string;
	description?: string | null;
	imageUrl?: string | null;
};

type UpdateSouceInput = { id: number; name: string; url: string };

export type { CreateEventInput, CreateOrUpdateCategoryInput, UpdateSouceInput };

export { EventOptionInput, EventSourceInput };
