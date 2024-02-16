import { createId } from "@paralleldrive/cuid2";
import { CronJob } from "cron";
import snakecaseKeys from "snakecase-keys";
import isURL from "validator/es/lib/isURL";
import { WalletService } from ".";
import { db } from "../config";
import { EventSchema, WalletSchema } from "../schema";
import { ErrorUtil } from "../util";

const EventStatus = ["scheduled", "frozen", "live", "completed"] as const;

type Category = {
	id: number;
	name: string;
	description?: string | null;
	image_url?: string | null;
	created_at: Date;
	updated_at: Date;
};

type Event = {
	id: string;
	name: string;
	description?: string | null;
	info?: string | null;
	image_url?: string | null;
	start_at: Date;
	end_at: Date;
	frozen: boolean;
	option_won?: number | null;
	platform_liquidity: number;
	min_liquidity_percentage: number;
	max_liquidity_percentage: number;
	liquidity_in_between: boolean;
	platform_fees_percentage: number;
	win_price: number;
	slippage: number;
	limit_order_enabled: boolean;
	token: WalletSchema.TokenEnum;
	chain: WalletSchema.ChainEnum;
	status: EventSchema.EventStatusEnum;
	created_at: Date;
	updated_at: Date;
};

type Source = {
	id: number;
	name: string;
	url: string;
	event_id: string;
	created_at: Date;
	updated_at: Date;
};

type Option = {
	id: number;
	name: string;
	image_url?: string | null;
	odds: number;
	event_id: string;
	created_at: Date;
	updated_at: Date;
};

const createOrUpdateCategory = async (payload: EventSchema.CreateOrUpdateCategoryInput) => {
	const snakecasePayload = snakecaseKeys(payload);

	if (snakecasePayload.image_url && !isURL(snakecasePayload.image_url)) throw new ErrorUtil.HttpException(400, "Invalid image url");

	if (snakecasePayload.id) {
		const res = await db.sql`UPDATE "event".category SET ${db.sql({ ...snakecasePayload, updated_at: new Date() })} WHERE id = ${snakecasePayload.id} RETURNING *;`;
		if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
		return res[0] as Category;
	}

	return (await db.sql`INSERT INTO "event".category ${db.sql(snakecasePayload)} RETURNING *;`)[0] as Category;
};

const getCategory = async (id: number) => {
	const res = await db.sql`SELECT * FROM "event".category WHERE id = ${id};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return res[0] as Category;
};

const deleteCategory = async (id: number) => {
	const res = await db.sql`DELETE FROM "event".category WHERE id = ${id} RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return res[0] as Category;
};

const getCategories = async (page: number, limit: number) =>
	(await db.sql`
		SELECT c.id, name, description, image_url, c.created_at, updated_at
		FROM "event".category AS c
		LEFT JOIN "event".event_category AS ec ON c.id = ec.category_id
		GROUP BY c.id, name, description, image_url, c.created_at, updated_at
		ORDER BY COUNT(ec.event_id) DESC
		LIMIT ${limit}
		OFFSET ${page * limit};`) as Category[];

const createEvent = async (payload: EventSchema.CreateEventInput) => {
	const snakecasePayload = snakecaseKeys(payload);
	const { option, source, category, ...event } = snakecasePayload;

	if (event.image_url && !isURL(event.image_url)) throw new ErrorUtil.HttpException(400, "Invalid image url");

	if (source.some((item) => !isURL(item.url))) throw new ErrorUtil.HttpException(400, "Invalid source url");

	if (option.some((item) => item.image_url && !isURL(item.image_url))) throw new ErrorUtil.HttpException(400, "Invalid option image url");

	if (event.start_at > event.end_at) throw new ErrorUtil.HttpException(400, "Start date should be less than end date");

	if (option.length !== 2) throw new ErrorUtil.HttpException(400, "Option length should be 2");

	if (option.reduce((acc, item) => acc + item.odds, 0) !== 100) throw new ErrorUtil.HttpException(400, "Odds should add up to 100");

	if (!WalletService.TokenCombination.some((item) => item.token === payload.token && item.chain === payload.chain))
		throw new ErrorUtil.HttpException(
			400,
			"Invalid token and chain combination. Allowed combinations are: " + WalletService.TokenCombination.map((item) => `${item.token} - ${item.chain}`).join(", ")
		);

	const id = createId();

	//Fetching category done in parallel because it's not dependent on the event creation. So, fetching it in parallel will save time.
	const [res, categoryRes] = await Promise.all([
		db.sql.begin(async (sql) => {
			const [eventRes]: [Event] = await sql`INSERT INTO "event".event ${sql({ ...event, id })} RETURNING *;`;
			const optionRes: Option[] = await sql`INSERT INTO "event".option ${sql(option.map((item) => ({ ...item, event_id: id })))} RETURNING *;`;
			const sourceRes: Source[] = (source.length && (await sql`INSERT INTO "event".source ${sql(source.map((item) => ({ ...item, event_id: id })))} RETURNING *;`)) || [];
			category.length && (await sql`INSERT INTO "event".event_category ${sql(category.map((item) => ({ event_id: id, category_id: item })))};`);

			return {
				...eventRes,
				option: optionRes,
				source: sourceRes
			};
		}),
		db.sql`SELECT * FROM "event".category WHERE id IN (${category});` as Promise<Category[]>
	]);

	return {
		...res,
		category: categoryRes
	};
};

const updateSource = async (payload: EventSchema.UpdateSouceInput) => {
	const snakecasePayload = snakecaseKeys(payload);

	if (!isURL(snakecasePayload.url)) throw new ErrorUtil.HttpException(400, "Invalid source url");

	const res = await db.sql`UPDATE "event".source SET ${db.sql({ ...snakecasePayload, updated_at: new Date() })} WHERE id = ${snakecasePayload.id} RETURNING *;`;

	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");

	return res[0] as Source;
};

const deleteSource = async (id: number) => {
	const res = await db.sql`DELETE FROM "event".source WHERE id = ${id} RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");
	return res[0] as Source;
};

new CronJob(
	"0/10 * * * * *",
	async () => {
		await db.sql`
    UPDATE "event".event
    SET status = CASE
        WHEN end_at < NOW() THEN 'completed'
        WHEN start_at < NOW() THEN 'live'
        ELSE status
    END
    WHERE status != 'completed';`;
	},
	null,
	true
);

export type { Category, Event, Option, Source };

export { EventStatus, createEvent, createOrUpdateCategory, deleteCategory, deleteSource, getCategories, getCategory, updateSource };
