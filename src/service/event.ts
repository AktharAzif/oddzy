import { createId } from "@paralleldrive/cuid2";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { db } from "../config";
import { EventSchema } from "../schema";
import type { CategoryPaginatedResponse, EventPaginatedResponse } from "../schema/event";
import { ErrorUtil } from "../util";
import * as WalletService from "./wallet";

const EventStatus = z.enum(["scheduled", "live", "completed"]);
type EventStatus = z.infer<typeof EventStatus>;

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
	price: z.coerce.number(),
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
	freezeAt: z.date().nullable(),
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

/**
 * This function retrieves an event from the database using its ID.
 *
 * @async
 * @function getEvent
 * @param {TransactionSql | Sql} sql - An instance of Sql or TransactionSql from the "postgres" package.
 * @param {string} id - The ID of the event to retrieve.
 * @returns {Promise<Event>} - Returns a promise that resolves to an Event object if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the event is not found.
 */
const getEvent = async (sql: TransactionSql | Sql, id: string): Promise<Event> => {
	const [event] = z.array(Event).parse(
		await db.sql`SELECT *
                 FROM "event".event
                 WHERE id = ${id};`
	);
	if (!event) throw new ErrorUtil.HttpException(404, "Event not found.");
	return Event.parse(event);
};
/**
 * This function creates or updates a category in the database.
 * If the payload contains an ID, it updates the category with the given ID.
 * If the payload does not contain an ID, it creates a new category.
 *
 * @async
 * @function createOrUpdateCategory
 * @param {EventSchema.CreateOrUpdateCategoryPayload} payload - The payload for creating or updating a category. It must be an object that adheres to the `CreateOrUpdateCategoryPayload` schema.
 * @returns {Promise<Category>} - Returns a promise that resolves to a Category object if the operation is successful. If the operation is an update and the category is not found, it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the operation is an update and the category is not found.
 */
const createOrUpdateCategory = async (payload: EventSchema.CreateOrUpdateCategoryPayload): Promise<Category> => {
	if (payload.id) {
		const { id, ...rest } = payload;

		const res = await db.sql`UPDATE "event".category
                             SET ${db.sql({ ...rest, updated_at: new Date() })}
                             WHERE id = ${id}
                             RETURNING *;`;
		if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
		return Category.parse(res[0]);
	}

	return Category.parse((await db.sql`INSERT INTO "event".category ${db.sql(payload)} RETURNING *;`)[0]);
};

/**
 * This function retrieves a category from the database using its ID.
 *
 * @async
 * @function getCategory
 * @param {number} id - The ID of the category to retrieve.
 * @returns {Promise<Category>} - Returns a promise that resolves to a Category object if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the category is not found.
 */
const getCategory = async (id: number): Promise<Category> => {
	const res = await db.sql`SELECT *
                           FROM "event".category
                           WHERE id = ${id};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return Category.parse(res[0]);
};

/**
 * This function deletes a category from the database using its ID.
 *
 * @async
 * @function deleteCategory
 * @param {number} id - The ID of the category to delete.
 * @returns {Promise<Category>} - Returns a promise that resolves to a Category object representing the deleted category if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the category is not found.
 */
const deleteCategory = async (id: number): Promise<Category> => {
	const res = await db.sql`DELETE
                           FROM "event".category
                           WHERE id = ${id}
                           RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Category not found");
	return Category.parse(res[0]);
};

/**
 * This function retrieves a list of categories from the database based on the provided pagination parameters.
 * The function returns a paginated response containing the categories and the total count of categories.
 *
 * @async
 * @function getCategories
 * @param {number} page - The page number for pagination. The first page is 0.
 * @param {number} limit - The number of categories to return per page.
 * @returns {Promise<CategoryPaginatedResponse>} - Returns a promise that resolves to a paginated response containing the categories and the total count of categories.
 */
const getCategories = async (page: number, limit: number): Promise<CategoryPaginatedResponse> => {
	const categories = db.sql`
      SELECT c.id, name, description, image_url, c.created_at, updated_at
      FROM "event".category AS c
               LEFT JOIN "event".event_category AS ec ON c.id = ec.category_id
      GROUP BY c.id, name, description, image_url, c.created_at, updated_at
      ORDER BY COUNT(ec.event_id) DESC
      LIMIT ${limit} OFFSET ${page * limit};`;
	const total = db.sql`
      SELECT COUNT(*)
      FROM "event".category;` as Promise<[{ count: string }]>;

	const [categoriesRes, [totalRes]] = await Promise.all([categories, total]);

	return {
		categories: z.array(Category).parse(categoriesRes),
		page: page + 1,
		limit: limit,
		total: Number(totalRes.count)
	};
};

/**
 * This function creates an event in the database.
 * It takes a payload that adheres to the `CreateEventPayload` schema.
 * The function creates an event, options, sources, and event categories in the database.
 * It also fetches the categories associated with the event.
 * The function returns an object that includes the created event, options, sources, and fetched categories.
 *
 * @async
 * @function createEvent
 * @param {EventSchema.CreateEventPayload} payload - The payload for creating an event. It must be an object that adheres to the `CreateEventPayload` schema.
 * @returns {Promise<Event & {category: Category[]; option: Option[]; source: Source[];}>} - Returns a promise that resolves to an object that includes the created event, options, sources, and fetched categories.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the operation fails.
 */
const createEvent = async (
	payload: EventSchema.CreateEventPayload
): Promise<
	Event & {
		categories: Category[];
		options: Option[];
		sources: Source[];
	}
> => {
	const { option, source, category, ...event } = payload;

	const id = createId();

	//Fetching category done in parallel because it's not dependent on the event creation.
	const [res, categoryRes] = await Promise.all([
		db.sql.begin(async (sql) => {
			const [eventRes] = await sql`INSERT INTO "event".event ${sql({ ...event, id })} RETURNING *;`;
			const optionRes = await sql`INSERT INTO "event".option ${sql(
				option.map((item) => ({
					...item,
					price: (item.odds * event.winPrice) / 100,
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
				options: z.array(Option).parse(optionRes),
				sources: z.array(Source).parse(sourceRes)
			};
		}),
		db.sql`SELECT *
           FROM "event".category
           WHERE id IN (${category});`
	]);

	return {
		...res,
		categories: z.array(Category).parse(categoryRes)
	};
};

/**
 * This function retrieves the categories associated with a specific event from the database using the event's ID.
 *
 * @async
 * @function getEventCategories
 * @param {string} eventId - The ID of the event whose categories are to be retrieved.
 * @returns {Promise<Category[]>} - Returns a promise that resolves to an array of Category objects associated with the event.
 */
const getEventCategories = async (eventId: string): Promise<Category[]> =>
	z.array(Category).parse(
		await db.sql`SELECT *
                 FROM "event".category
                 WHERE id IN (SELECT category_id
                              FROM "event".event_category
                              WHERE event_id = ${eventId});`
	);

/**
 * This function retrieves the sources associated with a specific event from the database using the event's ID.
 *
 * @async
 * @function getEventSources
 * @param {string} eventId - The ID of the event whose sources are to be retrieved.
 * @returns {Promise<Source[]>} - Returns a promise that resolves to an array of Source objects associated with the event.
 */
const getEventSources = async (eventId: string): Promise<Source[]> =>
	z.array(Source).parse(
		await db.sql`SELECT *
                 FROM "event".source
                 WHERE event_id = ${eventId};`
	);

/**
 * This function retrieves a source from the database using its ID.
 *
 * @async
 * @function getSource
 * @param {number} id - The ID of the source to retrieve.
 * @returns {Promise<Source>} - Returns a promise that resolves to a Source object if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the source is not found.
 */
const getSource = async (id: number): Promise<Source> => {
	const res = await db.sql`SELECT *
                           FROM "event".source
                           WHERE id = ${id};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");
	return Source.parse(res[0]);
};

/**
 * This function retrieves the options associated with a specific event from the database using the event's ID.
 *
 * @async
 * @function getEventOptions
 * @param {string} eventId - The ID of the event whose options are to be retrieved.
 * @returns {Promise<Option[]>} - Returns a promise that resolves to an array of Option objects associated with the event.
 */
const getEventOptions = async (eventId: string): Promise<Option[]> =>
	z.array(Option).parse(
		await db.sql`SELECT *
                 FROM "event".option
                 WHERE event_id = ${eventId};`
	);

/**
 * This function updates a source in the database.
 * It takes a payload that adheres to the `UpdateEventSourcePayload` schema.
 * The function updates the source with the provided ID and returns the updated source.
 *
 * @async
 * @function updateSource
 * @param {EventSchema.UpdateEventSourcePayload} payload - The payload for updating a source. It must be an object that adheres to the `UpdateEventSourcePayload` schema.
 * @returns {Promise<Source>} - Returns a promise that resolves to a Source object representing the updated source.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException with status 404 if the source is not found.
 */
const updateSource = async (payload: EventSchema.UpdateEventSourcePayload): Promise<Source> => {
	const { id, ...rest } = payload;

	const res = await db.sql`UPDATE "event".source
                           SET ${db.sql({ ...rest, updated_at: new Date() })}
                           WHERE id = ${id}
                           RETURNING *;`;

	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");

	return Source.parse(res[0]);
};

/**
 * This function deletes a source from the database using its ID.
 *
 * @async
 * @function deleteSource
 * @param {number} id - The ID of the source to delete.
 * @returns {Promise<Source>} - Returns a promise that resolves to a Source object representing the deleted source if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the source is not found.
 */
const deleteSource = async (id: number): Promise<Source> => {
	const res = await db.sql`DELETE
                           FROM "event".source
                           WHERE id = ${id}
                           RETURNING *;`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Source not found");
	return Source.parse(res[0]);
};

/**
 * This function updates the options of a specific event in the database.
 * It takes a payload that adheres to the `UpdateEventOptionPayload` schema.
 * The function updates the options with the provided IDs and returns the updated options.
 *
 * @async
 * @function updateOptions
 * @param {EventSchema.UpdateEventOptionPayload} payload - The payload for updating options. It must be an object that adheres to the `UpdateEventOptionPayload` schema.
 * @returns {Promise<Option[]>} - Returns a promise that resolves to an array of Option objects representing the updated options.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException with status 400 if an invalid option ID is provided.
 */
const updateOptions = async (payload: EventSchema.UpdateEventOptionPayload): Promise<Option[]> => {
	const { eventId, option } = payload;

	const optionIds = (
		(await db.sql`SELECT id
                  FROM "event".option
                  WHERE event_id = ${eventId};`) as { id: number }[]
	).map((item) => item.id);

	if (!optionIds.every((id) => option.some((item) => item.id === id))) throw new ErrorUtil.HttpException(400, "Invalid option id");

	const updateOptionsSqlPayload = option.map(({ id, name, imageUrl, odds }) => [id, name, imageUrl || null, odds]);

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

/**
 * This function retrieves a list of events from the database based on the provided filters and pagination parameters.
 * The function supports filtering by start time, end time, category, status, search term, token, and chain.
 * The function also supports pagination through the page and limit parameters.
 * The function returns a paginated response containing the filtered events and the total count of events that match the filters.
 *
 * @async
 * @function getEvents
 * @param {EventSchema.getEventsPayload} payload - The payload for retrieving events. It must be an object that adheres to the `getEventsPayload` schema.
 * @param {number} page - The page number for pagination. The first page is 0.
 * @param {number} limit - The number of events to return per page.
 * @returns {Promise<EventPaginatedResponse>} - Returns a promise that resolves to a paginated response containing the filtered events and the total count of events that match the filters.
 */
const getEvents = async (payload: EventSchema.getEventsPayload, page: number, limit: number): Promise<EventPaginatedResponse> => {
	const { startAt, endAt, category, status, search, token, chain } = payload;

	const events = db.sql`
      SELECT *
      FROM "event".event ${startAt || endAt || category || status || search || token || chain ? db.sql`WHERE true` : db.sql``} ${startAt ? db.sql`AND start_at >= ${startAt}` : db.sql``} ${endAt ? db.sql`AND end_at <= ${endAt}` : db.sql``}
          ${category ? db.sql`AND id IN (SELECT event_id FROM "event".event_category WHERE category_id IN ${db.sql(category)})` : db.sql``}
          ${status ? db.sql`AND status = ${status}` : db.sql``}
          ${search ? db.sql`AND name ILIKE ${`%${search}%`} OR description ILIKE ${`%${search}%`}` : db.sql``}
          ${token ? db.sql`AND token = ${token}` : db.sql``}
          ${chain ? db.sql`AND chain = ${chain}` : db.sql``}
      OFFSET ${page * limit} LIMIT ${limit};`;
	const total = db.sql`
      SELECT COUNT(*)
      FROM "event".event ${startAt || endAt || category || status || search || token || chain ? db.sql`WHERE true` : db.sql``} ${startAt ? db.sql`AND start_at >= ${startAt}` : db.sql``} ${endAt ? db.sql`AND end_at <= ${endAt}` : db.sql``}
          ${category ? db.sql`AND id IN (SELECT event_id FROM "event".event_category WHERE category_id IN ${db.sql(category)})` : db.sql``}
          ${status ? db.sql`AND status = ${status}` : db.sql``}
          ${search ? db.sql`AND name ILIKE ${`%${search}%`} OR description ILIKE ${`%${search}%`}` : db.sql``}
          ${token ? db.sql`AND token = ${token}` : db.sql``}
          ${chain ? db.sql`AND chain = ${chain}` : db.sql``};` as Promise<[{ count: string }]>;

	const [eventsRes, [totalRes]] = await Promise.all([events, total]);

	return {
		events: z.array(Event).parse(eventsRes),
		page: page + 1,
		limit: limit,
		total: Number(totalRes.count)
	};
};

/**
 * Flag to prevent multiple instances of the changeEventStatus function from running concurrently.
 */
let changeEventStatusRunning = false;

/**
 * This function changes the status of events in the database based on the current time.
 * It sets the status of an event to 'live' if the current time is between the event's start and end times and the event's status is not already 'live'.
 * It sets the status of an event to 'completed' if the current time is after the event's end time and the event's status is not already 'completed'.
 * The function uses a lock to ensure that updates to event statuses are synchronous with respect to the matching queue.
 * If an error occurs during the execution of the function, it logs the error and resets the changeEventStatusRunning flag to false.
 *
 * @async
 * @function changeEventStatus
 */
const changeEventStatus = async () => {
	try {
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

/**
 * This function calls the changeEventStatus function every 5 seconds.
 */
setInterval(changeEventStatus, 5 * 1000);

//todo update event, media libray, banners, //update category

//updatable, name, description, info, imageUrl, startAt, endAt, frozen, optionWon, platformLiquidityLeft, minLiquidityPercentage, maxLiquidityPercentage, liquidityInBetween, platformFeesPercentage, slippage,
// can't update startAt, endAt, option of completed event
//	Same for frozen

export {
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
	getEvent,
	getEvents,
	getSource
};
