import { createId } from "@paralleldrive/cuid2";
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
	id: z.coerce.number(),
	name: z.string(),
	description: z.string().nullable(),
	image_url: z.string().url().nullable(),
	created_at: z.date(),
	updated_at: z.date()
});
type Category = z.infer<typeof Category>;

const Source = z.object({
	id: z.coerce.number(),
	name: z.string(),
	url: z.string().url(),
	event_id: z.string(),
	created_at: z.date(),
	updated_at: z.date()
});
type Source = z.infer<typeof Source>;

const Option = z.object({
	id: z.coerce.number(),
	name: z.string(),
	image_url: z.string().url().nullable(),
	odds: z.coerce.number(),
	event_id: z.string(),
	created_at: z.date(),
	updated_at: z.date()
});
type Option = z.infer<typeof Option>;

const Event = z.object({
	id: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	info: z.string().nullable(),
	image_url: z.string().url().nullable(),
	start_at: z.date(),
	end_at: z.date(),
	frozen: z.boolean(),
	option_won: z.coerce.number().nullable(),
	platform_liquidity_left: z.coerce.number(),
	min_liquidity_percentage: z.coerce.number(),
	max_liquidity_percentage: z.coerce.number(),
	liquidity_in_between: z.boolean(),
	platform_fees_percentage: z.coerce.number(),
	win_price: z.coerce.number(),
	slippage: z.coerce.number(),
	token: WalletService.Token,
	chain: WalletService.Chain,
	status: EventStatus,
	created_at: z.date(),
	updated_at: z.date()
});
type Event = z.infer<typeof Event>;

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

	const updateOptionsSqlPayload = option.map(({ id, name, image_url, odds }) => [id, name, image_url || null, odds, new Date()]);

	const res = await db.sql`UPDATE "event".option
                           SET name       = update_data.name,
                               image_url  = update_data.image_url,
                               odds       = update_data.odds::float,
                               updated_at = update_data.updated_at
                           FROM (VALUES ${
															// @ts-ignore
															db.sql(updateOptionsSqlPayload)
														}) AS update_data (id, name, image_url, odds, updated_at)
                           WHERE "event".option.id = update_data.id::int
                           RETURNING *;`;

	return z.array(Option).parse(res);
};

/* Bet Logic */

// type Bet = {
// 	id: string;
// 	event_id: string;
// 	user_id: string | null;
// 	option_id: number;
// 	quantity: number;
// 	price_per_quantity: number;
// 	reward_amount_used: number;
// 	unmatched_quantity: number;
// 	type: EventSchema.BetTypeEnum;
// 	buy_bet_id?: string | null;
// 	profit: number | null;
// 	platform_commision: number | null;
// 	sold_quantity: number | null;
// 	created_at: Date;
// 	updated_at: Date;
// };
//
// type Transaction = {
// 	id: string;
// 	user_id: string;
// 	amount: number;
// 	reward_amount: number;
// 	tx_for: string;
// 	tx_status: string;
// 	tx_hash: string | null;
// 	token: WalletSchema.TokenEnum;
// 	chain: WalletSchema.ChainEnum;
// 	bet_id: string | null;
// 	bet_quantity: number | null;
// 	created_at: Date;
// 	updated_at: Date;
// };
//
// type InsertBetTransactionSqlPayload = {
// 	id: string;
// 	user_id: string;
// 	amount: number;
// 	reward_amount: number;
// 	tx_for: string;
// 	tx_status: string;
// 	token: WalletSchema.TokenEnum;
// 	chain: WalletSchema.ChainEnum;
// 	bet_id: string;
// 	bet_quantity: number;
// };
//
// type InsertMatchedSqlPayload = {
// 	bet_id: string;
// 	matched_bet_id: string;
// 	quantity: number;
// };
//
// const _getBuyBet = async (sql: TransactionSql, userId: string, event: Event, selectedOption: Option, buyBetId: string) =>
// 	sql`
//       SELECT *
//       FROM "event".bet
//       WHERE id = ${buyBetId}
//         AND event_id = ${event.id}
//         AND user_id = ${userId}
//         AND type = 'buy'
//         AND option_id = ${selectedOption.id}
// 	` as Promise<Bet[]>;
//
// const _getBalance = async (sql: TransactionSql, userId: string, event: Event) =>
// 	sql`
//       SELECT SUM(reward_amount)          as reward_balance,
//              SUM(amount + reward_amount) AS total_balance
//       FROM "wallet".transaction
//       WHERE user_id = ${userId}
//         AND token = ${event.token}
//         AND chain = ${event.chain}
// 	` as Promise<
// 		[
// 			{
// 				reward_balance: string | null;
// 				total_balance: string | null;
// 			}
// 		]
// 	>;
//
// const _getUnmatchedOrders = async (sql: TransactionSql, event: Event, type: EventSchema.BetTypeEnum, selectedOption: Option, otherOption: Option, price: number, quantity: number) =>
// 	// Not ordering the final result using cum_sum because we also need to consider the time of bet order
// 	sql`
//       WITH unmatched_orders AS (SELECT *,
//                                        quantity * price_per_quantity                                  AS total_price,
//                                        SUM(unmatched_quantity)
//                                        OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
//                                 FROM "event".bet
//                                 WHERE event_id = ${event.id}
//                                   AND unmatched_quantity > 0
//                                   AND ${
// 																		type === "buy"
// 																			? sql`( (type = 'buy' AND option_id = ${otherOption.id} AND price_per_quantity BETWEEN ${event.win_price - price - event.slippage} AND ${event.win_price - price + event.slippage}) OR (type = 'sell' AND option_id = ${selectedOption.id} AND price_per_quantity BETWEEN ${price - event.slippage} AND ${price + event.slippage}))`
// 																			: sql`type
//                                                 = 'buy' AND option_id =
//                                                 ${selectedOption.id}
//                                                 AND
//                                                 price_per_quantity
//                                                 BETWEEN
//                                                 ${price - event.slippage}
//                                                 AND
//                                                 ${price + event.slippage}`
// 																	})
//       SELECT *
//       FROM unmatched_orders
//       WHERE cum_sum <= ${quantity}
//       UNION
//       (SELECT *
//        FROM unmatched_orders
//        WHERE cum_sum >= ${quantity}
//        LIMIT 1)
//       ORDER BY total_price DESC, created_at ASC;
// 	` as Promise<(Bet & { total_price: number })[]>;
//
// const _getSellPayoutTxSqlPayload = (userId: string, sellBet: Bet, buyBet: Bet, event: Event) => {
// 	const buyBetTotal = buyBet.price_per_quantity * sellBet.quantity;
// 	const sellBetTotal = sellBet.price_per_quantity * sellBet.quantity;
//
// 	const earned = sellBetTotal - buyBetTotal;
// 	const commision = earned > 0 ? (sellBetTotal * event.platform_fees_percentage) / 100 : 0;
// 	const profit = earned - commision < 0 ? earned : earned - commision;
// 	//Platform commision is only taken if profit is greater than 0 after deducting the commision
// 	const platformCommision = profit === earned ? 0 : commision;
//
// 	const amount = sellBetTotal - platformCommision - sellBet.reward_amount_used;
//
// 	const payoutTxSqlPayload: InsertBetTransactionSqlPayload = {
// 		id: createId(),
// 		user_id: userId,
// 		amount,
// 		reward_amount: sellBet.reward_amount_used,
// 		tx_for: "bet",
// 		tx_status: "completed",
// 		token: event.token,
// 		chain: event.chain,
// 		bet_id: sellBet.id,
// 		bet_quantity: sellBet.quantity
// 	};
//
// 	return { payoutTxSqlPayload, profit, platformCommision };
// };
//
// const placeBet = async (user_id: string, payload: EventSchema.PlaceBetInput) => {
// 	const { price, quantity, eventId, type, buyBetId, optionId } = payload;
//
// 	const [event]: [Event] = await db.sql`SELECT *
//                                         FROM "event".event
//                                         WHERE id = ${eventId};`;
// 	//The library is converting the decimal to string. So, converting it back to number
// 	event.win_price = Number(event.win_price);
// 	event.slippage = Number(event.slippage);
//
// 	if (!event) throw new ErrorUtil.HttpException(400, "Event not found.");
// 	if (event.status !== "live") throw new ErrorUtil.HttpException(400, "Only live events are allowed for betting.");
// 	if (event.frozen) throw new ErrorUtil.HttpException(400, "Betting is locked for this event.");
// 	if (event.win_price < price) throw new ErrorUtil.HttpException(400, "Price is higher than win price.");
//
// 	const option: Option[] = await db.sql`SELECT *
//                                         FROM "event".option
//                                         WHERE event_id = ${event.id};`;
// 	const selectedOption = option.find((item) => item.id === optionId);
// 	if (!selectedOption) throw new ErrorUtil.HttpException(400, "Invalid option id.");
// 	const otherOption = option.find((item) => item.id !== optionId) as Option;
//
// 	const bet_id = createId();
// 	const totalPrice = price * quantity;
//
// 	const insertTxSqlPayload: InsertBetTransactionSqlPayload[] = [];
// 	const insertMatchedSqlPayload: InsertMatchedSqlPayload[] = [];
//
// 	const updateBetSqlPayload: {
// 		id: string;
// 		unmatched_quantity: number;
// 		profit: number | null;
// 		platform_commision: number | null;
// 		updated_at: Date;
// 	}[] = [];
//
// 	let reward_amount_used = 0;
//
// 	await db.sql.begin(async (sql) => {
// 		//Fetching buy bet if it is a sell bet to validate the quantity. Casting buy_bet_id as string because it's already validated in the graphql resolver
// 		const [buyBet] = type === "sell" ? await _getBuyBet(sql, user_id, event, selectedOption, buyBetId as string) : [];
//
// 		if (type === "buy") {
// 			const [{ reward_balance, total_balance }] = await _getBalance(sql, user_id, event);
// 			if (Number(total_balance) < totalPrice) throw new ErrorUtil.HttpException(400, "Insufficient balance.");
//
// 			//Reward amount have priority over the main balance
// 			reward_amount_used = totalPrice < Number(reward_balance) ? totalPrice : Number(reward_balance);
// 			const amount = totalPrice - reward_amount_used;
//
// 			//Only buy bet would require a debit transaction
// 			insertTxSqlPayload.push({
// 				id: createId(),
// 				user_id,
// 				amount: -amount,
// 				reward_amount: -reward_amount_used,
// 				tx_for: "bet",
// 				tx_status: "completed",
// 				token: event.token,
// 				chain: event.chain,
// 				bet_id,
// 				bet_quantity: quantity
// 			});
// 		} else {
// 			if (!buyBet) throw new ErrorUtil.HttpException(400, "Invalid buy bet id.");
// 			const matchedQuantity = buyBet.quantity - buyBet.unmatched_quantity;
// 			if (matchedQuantity < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than matched quantity.");
//
// 			//Sold quantity will always be a number because it's a buy bet. So, casting it as number
// 			if (matchedQuantity - (buyBet.sold_quantity as number) < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than remaining matched quantity.");
//
// 			//We are moving the reward amount from buy bet to sell bet to avoid double payouts
// 			reward_amount_used = totalPrice < buyBet.reward_amount_used ? totalPrice : buyBet.reward_amount_used;
//
// 			//Not batching the transaction because it is used before the batched transaction
// 			await sql`UPDATE "event".bet
//                 SET sold_quantity      = ${(buyBet.sold_quantity as number) + quantity},
//                     reward_amount_used = ${buyBet.reward_amount_used - reward_amount_used},
//                     updated_at         = NOW()
//                 WHERE id = ${buyBet.id}`;
// 		}
//
// 		const unmatched_orders = await _getUnmatchedOrders(sql, event, type, selectedOption, otherOption, price, quantity);
//
// 		let remaining_quantity = quantity;
//
// 		for (const order of unmatched_orders) {
// 			if (remaining_quantity === 0) break;
//
// 			const matchedQuantity = remaining_quantity < order.unmatched_quantity ? remaining_quantity : order.unmatched_quantity;
// 			remaining_quantity -= matchedQuantity;
//
// 			insertMatchedSqlPayload.push({
// 				bet_id,
// 				matched_bet_id: order.id,
// 				quantity: matchedQuantity
// 			});
//
// 			const unmatched_quantity = order.unmatched_quantity - matchedQuantity;
//
// 			if (order.type === "sell" && unmatched_quantity === 0 && order.user_id) {
// 				const [buyBet]: [Bet] = await sql`SELECT *
//                                           FROM "event".bet
//                                           WHERE id = ${order.buy_bet_id as string}`;
//
// 				const { payoutTxSqlPayload, profit, platformCommision } = _getSellPayoutTxSqlPayload(order.user_id, order, buyBet, event);
//
// 				updateBetSqlPayload.push({
// 					id: order.id,
// 					unmatched_quantity,
// 					profit,
// 					platform_commision: platformCommision,
// 					updated_at: new Date()
// 				});
// 				insertTxSqlPayload.push(payoutTxSqlPayload);
// 			} else {
// 				updateBetSqlPayload.push({
// 					id: order.id,
// 					unmatched_quantity,
// 					profit: order.profit,
// 					platform_commision: order.platform_commision,
// 					updated_at: new Date()
// 				});
// 			}
// 		}
//
// 		const insertBetSqlPayload = {
// 			id: bet_id,
// 			event_id: event.id,
// 			user_id,
// 			option_id: selectedOption.id,
// 			quantity,
// 			price_per_quantity: price,
// 			reward_amount_used,
// 			unmatched_quantity: remaining_quantity,
// 			type,
// 			sold_quantity: type === "buy" ? 0 : null,
// 			profit: null,
// 			platform_commision: null,
// 			created_at: new Date(),
// 			updated_at: new Date()
// 		};
//
// 		if (remaining_quantity === 0 && type === "sell") {
// 			const { payoutTxSqlPayload, profit, platformCommision } = _getSellPayoutTxSqlPayload(user_id, insertBetSqlPayload, buyBet, event);
//
// 			const sellBetSqlPayload = {
// 				...insertBetSqlPayload,
// 				buy_bet_id: buyBet.id,
// 				profit,
// 				platform_commision: platformCommision
// 			};
//
// 			insertTxSqlPayload.push(payoutTxSqlPayload);
//
// 			await sql`INSERT INTO "event".bet ${sql(sellBetSqlPayload)}`;
// 		} else {
// 			await sql`INSERT INTO "event".bet ${sql(insertBetSqlPayload)}`;
// 		}
//
// 		if (updateBetSqlPayload.length) {
// 			const payload = updateBetSqlPayload.map(({ id, unmatched_quantity, profit, platform_commision, updated_at }) => [id, unmatched_quantity, profit, platform_commision, updated_at]).flat();
//
// 			updateBetSqlPayload.length &&
// 				(await sql`
//           UPDATE "event".bet
//           SET unmatched_quantity = (update_data.unmatched_quantity)::int,
//               profit             = (update_data.profit)::decimal,
//               platform_commision = (update_data.platform_commission)::decimal,
//               updated_at         = update_data.updated_at
//           FROM (VALUES ${sql(payload)}) AS update_data (id, unmatched_quantity, profit, platform_commission, updated_at)
//           WHERE "event".bet.id = update_data.id
// 			`);
// 		}
//
// 		insertTxSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(insertTxSqlPayload)}`);
// 		insertMatchedSqlPayload.length && (await sql`INSERT INTO "event".matched ${sql(insertMatchedSqlPayload)}`);
// 	});
// };

//ref integrity on transaction
setInterval(async () => {
	await db.sql`
      UPDATE "event".event
      SET status = CASE
                       WHEN end_at < NOW() THEN 'completed'
                       WHEN start_at < NOW() THEN 'live'
                       ELSE status
          END
      WHERE status != 'completed';
	`;
}, 10 * 1000);

export type { Category, Event, Option, Source };

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
	updateSource
};
