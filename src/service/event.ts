import { createId } from "@paralleldrive/cuid2";
import type { Sql, TransactionSql } from "postgres";
import snakecaseKeys from "snakecase-keys";
import { z } from "zod";
import { db } from "../config";
import { EventSchema } from "../schema";
import { ErrorUtil } from "../util";
import * as WalletService from "./wallet";

const EventStatus = z.enum(["scheduled", "live", "completed"]);
type EventStatus = z.infer<typeof EventStatus>;

const BetType = z.enum(["buy", "sell"]);
type BetType = z.infer<typeof BetType>;

const Category = z.object({
	id: z.coerce.number().int(),
	name: z.string(),
	description: z.string().nullable(),
	imageUrl: z.string().url().nullable(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type Category = z.infer<typeof Category>;

const Source = z.object({
	id: z.coerce.number().int(),
	name: z.string(),
	url: z.string().url(),
	eventId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type Source = z.infer<typeof Source>;

const Option = z.object({
	id: z.coerce.number().int(),
	name: z.string(),
	imageUrl: z.string().url().nullable(),
	odds: z.coerce.number(),
	eventId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type Option = z.infer<typeof Option>;

const Event = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	info: z.string().nullable(),
	imageUrl: z.string().url().nullable(),
	startAt: z.date(),
	endAt: z.date(),
	frozen: z.boolean(),
	optionWon: z.coerce.number().int().nullable(),
	resolved: z.boolean(),
	resolvedAt: z.date().nullable(),
	platformLiquidityLeft: z.coerce.number(),
	minLiquidityPercentage: z.coerce.number(),
	maxLiquidityPercentage: z.coerce.number(),
	liquidityInBetween: z.boolean(),
	platformFeesPercentage: z.coerce.number(),
	winPrice: z.coerce.number(),
	slippage: z.coerce.number(),
	token: WalletService.Token,
	chain: WalletService.Chain,
	status: EventStatus,
	createdAt: z.date(),
	updatedAt: z.date()
});
type Event = z.infer<typeof Event>;

const getEvent = async (sql: TransactionSql | Sql, id: string): Promise<Event> => {
	const [event] = z.array(Event).parse(
		await db.sql`SELECT *
                 FROM "event".event
                 WHERE id = ${id};`
	);
	if (!event) throw new ErrorUtil.HttpException(404, "Event not found.");
	return Event.parse(event);
};

const createOrUpdateCategory = async (payload: EventSchema.CreateOrUpdateCategoryPayload): Promise<Category> => {
	const data = snakecaseKeys(payload);

	if (data.id) {
		const { id, ...rest } = data;

		const res = await db.sql`UPDATE "event".category
                             SET ${db.sql({ ...rest, updated_at: new Date() })}
                             WHERE id = ${id}
                             RETURNING *;`;
		if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
		return Category.parse(res[0]);
	}

	return (await db.sql`INSERT INTO "event".category ${db.sql(data)} RETURNING *;`)[0] as Category;
};

const getCategory = async (id: number): Promise<Category> => {
	const res = await db.sql`SELECT *
                           FROM "event".category
                           WHERE id = ${id};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return Category.parse(res[0]);
};

const deleteCategory = async (id: number): Promise<Category> => {
	const res = await db.sql`DELETE
                           FROM "event".category
                           WHERE id = ${id}
                           RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return Category.parse(res[0]);
};

const getCategories = async (page: number, limit: number): Promise<Category[]> =>
	z.array(Category).parse(
		await db.sql`
        SELECT c.id, name, description, image_url, c.created_at, updated_at
        FROM "event".category AS c
                 LEFT JOIN "event".event_category AS ec ON c.id = ec.category_id
        GROUP BY c.id, name, description, image_url, c.created_at, updated_at
        ORDER BY COUNT(ec.event_id) DESC
        LIMIT ${limit} OFFSET ${page * limit};`
	);

const createEvent = async (
	payload: EventSchema.CreateEventPayload
): Promise<
	Event & {
		category: Category[];
		option: Option[];
		source: Source[];
	}
> => {
	const data = snakecaseKeys(payload);
	const { option, source, category, ...event } = data;

	const id = createId();

	//Fetching category done in parallel because it's not dependent on the event creation.
	const [res, categoryRes] = await Promise.all([
		db.sql.begin(async (sql) => {
			const [eventRes] = await sql`INSERT INTO "event".event ${sql({ ...event, id })} RETURNING *;`;
			const optionRes = await sql`INSERT INTO "event".option ${sql(
				option.map((item) => ({
					...item,
					event_id: id
				}))
			)} RETURNING *;`;

			const sourceRes =
				(source.length &&
					(await sql`INSERT INTO "event".source ${sql(
						source.map((item) => ({
							...item,
							event_id: id
						}))
					)} RETURNING *;`)) ||
				[];

			category.length &&
				(await sql`INSERT INTO "event".event_category ${sql(
					category.map((item) => ({
						event_id: id,
						category_id: item
					}))
				)};`);

			return {
				...Event.parse(eventRes),
				option: z.array(Option).parse(optionRes),
				source: z.array(Source).parse(sourceRes)
			};
		}),
		db.sql`SELECT *
           FROM "event".category
           WHERE id IN (${category});`
	]);

	console.log("res", res);

	return {
		...res,
		category: z.array(Category).parse(categoryRes)
	};
};

const getEventCategories = async (eventId: string): Promise<Category[]> =>
	z.array(Category).parse(
		await db.sql`SELECT *
                 FROM "event".category
                 WHERE id IN (SELECT category_id
                              FROM "event".event_category
                              WHERE event_id = ${eventId});`
	);

const getEventSources = async (eventId: string): Promise<Source[]> =>
	z.array(Source).parse(
		await db.sql`SELECT *
                 FROM "event".source
                 WHERE event_id = ${eventId};`
	);

const getEventOptions = async (eventId: string): Promise<Option[]> =>
	z.array(Option).parse(
		await db.sql`SELECT *
                 FROM "event".option
                 WHERE event_id = ${eventId};`
	);

const updateSource = async (payload: EventSchema.UpdateEventSourcePayload): Promise<Source> => {
	const data = snakecaseKeys(payload);

	const { id, ...rest } = data;

	const res = await db.sql`UPDATE "event".source
                           SET ${db.sql({ ...rest, updated_at: new Date() })}
                           WHERE id = ${id}
                           RETURNING *;`;

	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");

	return Source.parse(res[0]);
};

const deleteSource = async (id: number): Promise<Source> => {
	const res = await db.sql`DELETE
                           FROM "event".source
                           WHERE id = ${id}
                           RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");
	return Source.parse(res[0]);
};

const updateOptions = async (payload: EventSchema.UpdateEventOptionPayload): Promise<Option[]> => {
	const { event_id, option } = snakecaseKeys(payload);

	const optionIds = (
		(await db.sql`SELECT id
                  FROM "event".option
                  WHERE event_id = ${event_id};`) as { id: number }[]
	).map((item) => item.id);

	if (!optionIds.every((id) => option.some((item) => item.id === id))) throw new ErrorUtil.HttpException(400, "Invalid option id");

	const updateOptionsSqlPayload = option.map(({ id, name, image_url, odds }) => [id, name, image_url || null, odds]);

	//noinspection SqlResolve
	const res = await db.sql`UPDATE "event".option
                           SET name       = update_data.name,
                               image_url  = update_data.image_url,
                               odds       = update_data.odds::float,
                               updated_at = NOW()
                           FROM (VALUES ${
															// @ts-ignore
															db.sql(updateOptionsSqlPayload)
														}) AS update_data (id, name, image_url, odds)
                           WHERE "event".option.id = update_data.id::int
                           RETURNING *;`;

	return z.array(Option).parse(res);
};

let changeEventStatusRunning = false;
const changeEventStatus = async () => {
	try {
		//The SQL statement is structured this way, rather than using a single query, to achieve synchronous updates of event statuses with respect to the matching queue.
		if (changeEventStatusRunning) return;
		changeEventStatusRunning = true;

		const events = z.array(Event).parse(
			await db.sql`SELECT *
                   FROM "event".event
                   WHERE (NOW() BETWEEN start_at AND end_at AND status != 'live')
                      OR (end_at < NOW() AND status != 'completed')`
		);

		for (const event of events) {
			await db.sql.begin(async (sql) => {
				await sql`SELECT pg_advisory_xact_lock(hashtext(${event.id}))`;
				await sql`UPDATE "event".event
                  SET status = CASE
                                   WHEN end_at < NOW() THEN 'completed'
                                   WHEN start_at < NOW() THEN 'live'
                                   ELSE status
                      END
                  WHERE id = ${event.id};`;
			});
		}

		changeEventStatusRunning = false;
	} catch (e) {
		console.error("Error in changing event status", e);
		changeEventStatusRunning = false;
	}
};

setInterval(changeEventStatus, 5 * 1000);

export {
	BetType,
	EventStatus,
	createEvent,
	createOrUpdateCategory,
	deleteCategory,
	deleteSource,
	getCategories,
	getCategory,
	getEventCategories,
	getEventOptions,
	getEventSources,
	updateOptions,
	updateSource,
	Category,
	Event,
	Option,
	Source,
	getEvent
};
