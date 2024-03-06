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
		await sql`SELECT *
              FROM "event".event
              WHERE id = ${id};`
	);
	if (!event) throw new ErrorUtil.HttpException(404, "Event not found.");
	return Event.parse(event);
};

/**
 * This function retrieves an option from the database using its ID.
 *
 * @async
 * @function getOption
 * @param {number} id - The ID of the option to retrieve.
 * @returns {Promise<Option>} - Returns a promise that resolves to an Option object if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the option is not found.
 */
const getOption = async (id: number): Promise<Option> => {
	const res = await db.sql`SELECT *
                           FROM "event".option
                           WHERE id = ${id};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Option not found");
	return Option.parse(res[0]);
};

/**
 * This function retrieves an event from the database using the ID of a bet.
 *
 * @async
 * @function getEventByBetId
 * @param {string} betId - The ID of the bet whose associated event is to be retrieved.
 * @returns {Promise<Event>} - Returns a promise that resolves to an Event object if found, otherwise it throws an HttpException with status 404.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException if the event is not found.
 */
const getEventByBetId = async (betId: string): Promise<Event> => {
	const res = await db.sql`SELECT e.*
                           FROM "event".event AS e
                                    JOIN "event".bet AS b ON e.id = b.event_id
                           WHERE b.id = ${betId};`;
	if (!res.length) throw new ErrorUtil.HttpException(404, "Event not found");
	return Event.parse(res[0]);
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
		category.length
			? db.sql`SELECT *
               FROM "event".category
               WHERE id IN (${category})`
			: []
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

	const event = await getEvent(db.sql, eventId);
	if (event.status === "completed") throw new ErrorUtil.HttpException(400, "Can't update options of completed event");

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
 * This function updates an event in the database.
 * It takes a payload that adheres to the `UpdateEventPayload` schema.
 * The function updates the event with the provided ID and returns the updated event.
 * The function uses a lock to ensure that updates to event statuses are synchronous with respect to the matching queue.
 * The keys of the payload object are looped through and the ones that are not equal to the event are found.
 * If the event is completed and any of the fields that cannot be updated for a completed event are present in the payload, the function throws an HttpException with status 400.
 * If the payload data is same as of the event, the function throws an HttpException with status 400.
 *
 * @async
 * @function updateEvent
 * @param {EventSchema.UpdateEventPayload} payload - The payload for updating an event. It must be an object that adheres to the `UpdateEventPayload` schema.
 * @returns {Promise<Event>} - Returns a promise that resolves to an Event object representing the updated event.
 * @throws {ErrorUtil.HttpException} - Throws an HttpException with status 400 if an invalid field is attempted to be updated.
 */
const updateEvent = async (payload: EventSchema.UpdateEventPayload): Promise<Event> => {
	const { id } = payload;
	return await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`;

		const event = await getEvent(sql, id);

		Object.keys(payload).forEach((key) => {
			const keyName = key as keyof EventSchema.UpdateEventPayload;
			const payloadValue = payload[keyName] instanceof Date ? (payload[keyName] as Date).toISOString() : payload[keyName];
			const eventValue = event[keyName] instanceof Date ? (event[keyName] as Date).toISOString() : event[keyName];

			if (payloadValue === eventValue) {
				delete payload[keyName];
			}
		});

		const { startAt, endAt, frozen, freezeAt, optionWon, platformLiquidityLeft, minLiquidityPercentage, maxLiquidityPercentage, liquidityInBetween, platformFeesPercentage, slippage } = payload;

		if (
			event.status === "completed" &&
			(startAt || endAt || frozen || freezeAt || platformFeesPercentage || platformLiquidityLeft || minLiquidityPercentage || maxLiquidityPercentage || liquidityInBetween || slippage)
		)
			throw new ErrorUtil.HttpException(
				400,
				"Can't update startAt, endAt, frozen, freezeAt, platformFeesPercentage, platformLiquidityLeft, minLiquidityPercentage, maxLiquidityPercentage, liquidityInBetween, slippage of completed event"
			);

		if (event.status === "completed" && optionWon) throw new ErrorUtil.HttpException(400, "Can't update winningOption of a completed event");

		if (optionWon) {
			const validOption = await sql`
          SELECT id
          FROM "event".option
          WHERE event_id = ${id}
            AND id = ${optionWon}`;
			if (!validOption.length) throw new ErrorUtil.HttpException(400, "Invalid winning option");
		}

		if (event.status === "live" && startAt) throw new ErrorUtil.HttpException(400, "Can't update startAt of live event");

		if (Object.keys(payload).length === 0) throw new ErrorUtil.HttpException(400, "No field to update");

		const { id: _, ...data } = payload;

		const sqlPayload = {
			...data,
			...(data.optionWon ? { status: "completed", endAt: new Date() } : {}),
			...(data.frozen ? { freezeAt: new Date() } : {}),
			updated_at: new Date()
		};

		const res = await sql`UPDATE "event".event
                          SET ${db.sql(sqlPayload)}
                          WHERE id = ${id}
                          RETURNING *;`;
		return Event.parse(res[0]);
	});
};

/**
 * This function updates the categories associated with a specific event in the database.
 * It takes the ID of the event and an array of category IDs.
 * The function first retrieves the current categories associated with the event.
 * It then determines which categories need to be added and which need to be removed to match the provided array of category IDs.
 * The function deletes the categories that need to be removed and adds the categories that need to be added.
 * The categories are not directly deleted and re-added because we need the time the category is added.
 *
 * @async
 * @function updateEventCategories
 * @param {string} eventId - The ID of the event whose categories are to be updated.
 * @param {number[]} categories - An array of category IDs that should be associated with the event after the update.
 */
const updateEventCategories = async (eventId: string, categories: number[]) => {
	await db.sql.begin(async (sql) => {
		// Not deleting because we need the time the category is added
		const currentCategories = await sql`SELECT category_id
                                        FROM "event".event_category
                                        WHERE event_id = ${eventId};`;
		const currentCategoriesArray = currentCategories.map((item) => Number(item.categoryId));

		const toDelete = currentCategoriesArray.filter((item) => !categories.includes(item));
		const toAdd = categories.filter((item) => !currentCategoriesArray.includes(item));
		if (toDelete.length) {
			await sql`DELETE
                FROM "event".event_category
                WHERE event_id = ${eventId}
                  AND category_id IN ${sql(toDelete)};`;
		}
		if (toAdd.length) {
			await sql`INSERT INTO "event".event_category ${sql(
				toAdd.map((item) => ({
					event_id: eventId,
					category_id: item
				}))
			)};`;
		}
	});
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
      ORDER BY start_at DESC
      OFFSET ${page * limit} LIMIT ${limit}
	`;
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
 * This function is used to delete an event from the database.
 * It deletes the event with the provided ID and returns the deleted event.
 * If the event has any associated bets, it throws an HTTP exception with status code 400 and message "Only events with no bets can be deleted".
 * If the event does not exist, it throws an HTTP exception with status code 404 and message "Event not found".
 *
 * @param {string} id - The ID of the event to be deleted.
 * @returns {Promise<Event>} The deleted event.
 * @throws {ErrorUtil.HttpException} If the event has any associated bets or does not exist.
 * @async
 */
const deleteEvent = async (id: string): Promise<Event> => {
	const res = await db.sql`DELETE
                           FROM "event".event
                           WHERE id = ${id}
                           RETURNING *;`.catch(() => {
		throw new ErrorUtil.HttpException(400, "Only events with no bets can be deleted");
	});
	if (!res.length) throw new ErrorUtil.HttpException(404, "Event not found");
	return Event.parse(res[0]);
};

/**
 * This function retrieves the total pool of an event from the database using the event's ID.
 * The pool is calculated as the sum of the used reward amount and the product of the quantity and price per quantity for all bets of type 'buy' associated with the event.
 * The function returns the total pool as a number.
 *
 * @async
 * @function getEventPool
 * @param {string} eventId - The ID of the event whose pool is to be retrieved.
 * @returns {Promise<number>} - Returns a promise that resolves to the total pool of the event as a number.
 */
const getEventPool = async (eventId: string): Promise<number> => {
	const [pool] = (await db.sql`
      SELECT SUM(reward_amount_used + (quantity * price_per_quantity))
      FROM "event".bet
      WHERE event_id = ${eventId}
        AND type = 'buy'
	`) as [{ sum: string }];

	return Number(pool.sum);
};
/**
 * This function retrieves the time of the last bet placed on a specific event from the database using the event's ID.
 * The function returns the time of the last bet as a Date object.
 *
 * @async
 * @function getLastBetTime
 * @param {string} eventId - The ID of the event whose last bet time is to be retrieved.
 * @returns {Promise<Date>} - Returns a promise that resolves to a Date object representing the time of the last bet placed on the event.
 */

const getLastBetTime = async (eventId: string): Promise<Date> => {
	const [lastBetTime] = (await db.sql`
      SELECT MAX(created_at)
      FROM "event".bet
      WHERE event_id = ${eventId}
	`) as [{ max: Date }];

	return lastBetTime.max;
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

/**
 * This function is set to run every 5 seconds.
 * It updates the 'frozen' status of all 'live' events in the database to 'true' if the current time is past the 'freeze_at' time of the event.
 * The 'frozen' status of an event determines whether bets can be placed on the event.
 * When an event is 'frozen', no more bets can be placed on the event.
 * The function uses a SQL query to update the 'frozen' status of the events.
 *
 * @async
 */
setInterval(async () => {
	await db.sql`UPDATE "event".event
               SET frozen = true
               WHERE freeze_at < NOW()
                 AND status = 'live'
                 AND frozen = false;`;
}, 5 * 1000);

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
	getSource,
	updateEvent,
	updateEventCategories,
	getOption,
	getEventByBetId,
	deleteEvent,
	getEventPool,
	getLastBetTime
};
