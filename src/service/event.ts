import { createId } from "@paralleldrive/cuid2";
import type { TransactionSql } from "postgres";
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
	image_url: z.string().url().nullable(),
	created_at: z.date(),
	updated_at: z.date()
});
type Category = z.infer<typeof Category>;

const Source = z.object({
	id: z.coerce.number().int(),
	name: z.string(),
	url: z.string().url(),
	event_id: z.string(),
	created_at: z.date(),
	updated_at: z.date()
});
type Source = z.infer<typeof Source>;

const Option = z.object({
	id: z.coerce.number().int(),
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
	option_won: z.coerce.number().int().nullable(),
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

const Bet = z.object({
	id: z.string(),
	event_id: z.string(),
	user_id: z.string().nullable(),
	option_id: z.coerce.number().int(),
	quantity: z.coerce.number().int(),
	price_per_quantity: z.coerce.number(),
	reward_amount_used: z.coerce.number(),
	unmatched_quantity: z.coerce.number().int(),
	type: BetType,
	buy_bet_id: z.string().nullable(),
	profit: z.coerce.number().nullable(),
	platform_commission: z.coerce.number().nullable(),
	sold_quantity: z.coerce.number().int().nullable(),
	created_at: z.date(),
	updated_at: z.date()
});

type Bet = z.infer<typeof Bet>;

type InsertBetTxSqlPayload = {
	id: string;
	user_id: string;
	amount: number;
	reward_amount: number;
	tx_for: string;
	tx_status: string;
	token: WalletService.Token;
	chain: WalletService.Chain;
	bet_id: string;
	bet_quantity: number;
};

type InsertMatchedBetSqlPayload = {
	bet_id: string;
	matched_bet_id: string;
	quantity: number;
};

type UpdateBetSqlPayload = {
	id: string;
	unmatched_quantity: number;
	profit: number | null;
	platform_commission: number | null;
};

type BuyBetValidationPayload = {
	userId: string;
	event: Event;
	selectedOption: Option;
	buyBetId: string;
};

type GetBalancePayload = {
	userId: string;
	event: Event;
};

type CheckBalanceAndReturnBetTxSqlPayload = {
	userId: string;
	event: Event;
	totalPrice: number;
	betId: string;
	quantity: number;
};

type ValidateSellBetAndUpdateBuyBetPayload = {
	buyBet: Bet;
	quantity: number;
	totalPrice: number;
};

type GetUnmatchedOrdersPayload = {
	event: Event;
	type: BetType;
	selectedOption: Option;
	otherOption: Option;
	price: number;
	quantity: number;
};

type GetSellPayoutTxSqlPayload = {
	userId: string;
	sellBet: Bet;
	buyBet?: Bet;
	event: Event;
};

type MatchOrdersPayload = {
	event: Event;
	betId: string;
	selectedOption: Option;
	otherOption: Option;
	type: BetType;
	price: number;
	quantity: number;
};

type GetInsertBetTxSqlPayload = {
	userId: string;
	betId: string;
	option: Option;
	event: Event;
	price: number;
	rewardAmountUsed: number;
	quantity: number;
	remainingQuantity: number;
	type: BetType;
	buyBet?: Bet;
};

type PlaceCounterLiquidityBetPayload = {
	bet: Bet;
	event: Event;
	selectedOption: Option;
	otherOption: Option;
	quantity: number;
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

const _validateOption = async (eventId: string, optionId: number) => {
	const option = z.array(Option).parse(
		await db.sql`SELECT *
                 FROM "event".option
                 WHERE event_id = ${eventId};`
	);

	const selectedOption = option.find((item) => item.id === optionId);
	if (!selectedOption) throw new ErrorUtil.HttpException(400, "Invalid option id.");
	const otherOption = option.find((item) => item.id !== optionId) as Option;

	return { selectedOption, otherOption };
};

const _validateEvent = async (sql: TransactionSql, eventId: string) => {
	const [event] = z.array(Event).parse(
		await sql`SELECT *
              FROM "event".event
              WHERE id = ${eventId};`
	);

	if (!event) throw new ErrorUtil.HttpException(400, "Event not found.");
	if (event.status !== "live") throw new ErrorUtil.HttpException(400, "Only live events are allowed for betting.");
	if (event.frozen) throw new ErrorUtil.HttpException(400, "Betting is locked for this event.");
	return event;
};

const _buyBetValidation = (sql: TransactionSql, { userId, event, selectedOption, buyBetId }: BuyBetValidationPayload) =>
	sql`
      SELECT *
      FROM "event".bet
      WHERE id = ${buyBetId}
        AND event_id = ${event.id}
        AND user_id = ${userId}
        AND type = 'buy'
        AND option_id = ${selectedOption.id}
	` as Promise<Bet[]>;

const _getBalance = async (sql: TransactionSql, { userId, event }: GetBalancePayload) => {
	const [{ reward_balance, total_balance }] = (await sql`
      SELECT SUM(reward_amount)          as reward_balance,
             SUM(amount + reward_amount) AS total_balance
      FROM "wallet".transaction
      WHERE user_id = ${userId}
        AND token = ${event.token}
        AND chain = ${event.chain}
	`) as [
		{
			reward_balance: string | null;
			total_balance: string | null;
		}
	];

	return {
		reward_balance: Number(reward_balance),
		total_balance: Number(total_balance)
	};
};

const _checkBalanceAndReturnBetTxSqlPayload = async (sql: TransactionSql, { userId, event, totalPrice, betId, quantity }: CheckBalanceAndReturnBetTxSqlPayload): Promise<InsertBetTxSqlPayload> => {
	const { reward_balance, total_balance } = await _getBalance(sql, {
		userId,
		event
	});

	if (total_balance < totalPrice) throw new ErrorUtil.HttpException(400, "Insufficient balance.");

	//Reward amount have priority over the main balance
	const reward_amount_used = totalPrice < reward_balance ? totalPrice : reward_balance;
	const amount = totalPrice - reward_amount_used;

	return {
		id: createId(),
		user_id: userId,
		amount: -amount,
		reward_amount: -reward_amount_used,
		tx_for: "bet",
		tx_status: "completed",
		token: event.token,
		chain: event.chain,
		bet_id: betId,
		bet_quantity: quantity
	};
};

const _validateSellBetAndUpdateBuyBet = async (sql: TransactionSql, { buyBet, quantity, totalPrice }: ValidateSellBetAndUpdateBuyBetPayload) => {
	if (!buyBet) throw new ErrorUtil.HttpException(400, "Invalid buy bet id.");
	const matchedQuantity = buyBet.quantity - buyBet.unmatched_quantity;
	if (matchedQuantity < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than matched quantity.");

	//Sold quantity will always be a number because it's a buy bet. So, casting it as number
	if (matchedQuantity - (buyBet.sold_quantity as number) < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than remaining matched quantity.");

	//We are moving the reward amount from buy bet to sell bet to avoid double payouts
	const reward_amount_used = totalPrice < buyBet.reward_amount_used ? totalPrice : buyBet.reward_amount_used;

	//Not batching the transaction because it is used before the batched transaction
	await sql`UPDATE "event".bet
            SET sold_quantity      = ${(buyBet.sold_quantity as number) + quantity},
                reward_amount_used = ${buyBet.reward_amount_used - reward_amount_used},
                updated_at         = NOW()
            WHERE id = ${buyBet.id}`;

	return reward_amount_used;
};

const _getUnmatchedOrders = async (sql: TransactionSql, { event, type, selectedOption, otherOption, price, quantity }: GetUnmatchedOrdersPayload) =>
	// Not ordering the final result using cum_sum because we also need to consider the time of bet order
	sql`
      WITH unmatched_orders AS (SELECT *,
                                       quantity * price_per_quantity                                  AS total_price,
                                       SUM(unmatched_quantity)
                                       OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
                                FROM "event".bet
                                WHERE event_id = ${event.id}
                                  AND unmatched_quantity > 0
                                  AND ${
																		type === "buy"
																			? //Ignore the error in the following line if the editor shows it.
																				sql`(("type" = 'buy' AND option_id = ${otherOption.id} AND price_per_quantity BETWEEN ${event.win_price - price - event.slippage} AND ${event.win_price - price + event.slippage}) OR (type = 'sell' AND option_id = ${selectedOption.id} AND price_per_quantity BETWEEN ${price - event.slippage} AND ${price + event.slippage}))`
																			: sql`type
                                                = 'buy' AND option_id =
                                                ${selectedOption.id}
                                                AND
                                                price_per_quantity
                                                BETWEEN
                                                ${price - event.slippage}
                                                AND
                                                ${price + event.slippage}`
																	})
      SELECT *
      FROM unmatched_orders
      WHERE cum_sum <= ${quantity}
      UNION
      (SELECT *
       FROM unmatched_orders
       WHERE cum_sum >= ${quantity}
       LIMIT 1)
      ORDER BY total_price DESC, created_at;
	` as Promise<(Bet & { total_price: number })[]>;

const _getSellPayoutTxSqlPayload = async (sql: TransactionSql, { sellBet, event, userId, buyBet }: GetSellPayoutTxSqlPayload) => {
	buyBet =
		buyBet ||
		Bet.parse(
			(
				await sql`SELECT *
                  FROM "event".bet
                  WHERE id = ${sellBet.buy_bet_id as string}`
			)[0]
		);

	const buyBetTotal = buyBet.price_per_quantity * sellBet.quantity;
	const sellBetTotal = sellBet.price_per_quantity * sellBet.quantity;

	const earned = sellBetTotal - buyBetTotal;
	const commission = earned > 0 ? (sellBetTotal * event.platform_fees_percentage) / 100 : 0;
	const profit = earned - commission < 0 ? earned : earned - commission;
	//Platform commission is only taken if profit is greater than 0 after deducting the commission
	const platformCommission = profit === earned ? 0 : commission;

	const amount = sellBetTotal - platformCommission - sellBet.reward_amount_used;

	const payoutTxSqlPayload: InsertBetTxSqlPayload = {
		id: createId(),
		user_id: userId,
		amount,
		reward_amount: sellBet.reward_amount_used,
		tx_for: "bet",
		tx_status: "completed",
		token: event.token,
		chain: event.chain,
		bet_id: sellBet.id,
		bet_quantity: sellBet.quantity
	};

	return { payoutTxSqlPayload, profit, platformCommission };
};

const _matchOrders = async (sql: TransactionSql, { event, betId, selectedOption, type, otherOption, price, quantity }: MatchOrdersPayload) => {
	//Ignores the total price returned from the query because it's not used. So that's why Bet is used to parse the result
	const unmatchedOrders = z.array(Bet).parse(
		await _getUnmatchedOrders(sql, {
			event,
			type,
			selectedOption,
			otherOption,
			price,
			quantity
		})
	);
	const updateBetSqlPayload: UpdateBetSqlPayload[] = [];
	const insertMatchedBetSqlPayload: InsertMatchedBetSqlPayload[] = [];
	const insertBetTxSqlPayload: InsertBetTxSqlPayload[] = [];

	let remainingQuantity = quantity;

	for (const order of unmatchedOrders) {
		if (remainingQuantity === 0) break;

		const matchedQuantity = remainingQuantity < order.unmatched_quantity ? remainingQuantity : order.unmatched_quantity;
		remainingQuantity -= matchedQuantity;

		insertMatchedBetSqlPayload.push({
			bet_id: betId,
			matched_bet_id: order.id,
			quantity: matchedQuantity
		});

		const unmatchedQuantity = order.unmatched_quantity - matchedQuantity;

		if (order.type === "sell" && unmatchedQuantity === 0 && order.user_id) {
			const { payoutTxSqlPayload, profit, platformCommission } = await _getSellPayoutTxSqlPayload(sql, {
				userId: order.user_id,
				sellBet: order,
				event
			});

			updateBetSqlPayload.push({
				id: order.id,
				unmatched_quantity: unmatchedQuantity,
				profit,
				platform_commission: platformCommission
			});
			insertBetTxSqlPayload.push(payoutTxSqlPayload);
		} else {
			updateBetSqlPayload.push({
				id: order.id,
				unmatched_quantity: unmatchedQuantity,
				profit: null,
				platform_commission: null
			});
		}
	}

	return {
		insertBetTxSqlPayload,
		insertMatchedBetSqlPayload,
		updateBetSqlPayload,
		remainingQuantity
	};
};

const _getInsertBetTxSqlPayload = async (
	sql: TransactionSql,
	{ userId, betId, option, event, price, rewardAmountUsed, quantity, remainingQuantity, type, buyBet }: GetInsertBetTxSqlPayload
): Promise<[Bet, InsertBetTxSqlPayload | null]> => {
	const insertBetSqlPayload: Bet = {
		id: betId,
		event_id: event.id,
		user_id: userId,
		option_id: option.id,
		quantity,
		price_per_quantity: price,
		reward_amount_used: rewardAmountUsed,
		unmatched_quantity: remainingQuantity,
		type,
		sold_quantity: type === "buy" ? 0 : null,
		//@ts-ignore - buyBetId is defined if type is sell
		buy_bet_id: type === "buy" ? null : buyBet.id,
		profit: null,
		platform_commission: null,
		created_at: new Date(),
		updated_at: new Date()
	};

	if (remainingQuantity === 0 && type === "sell") {
		const { payoutTxSqlPayload, profit, platformCommission } = await _getSellPayoutTxSqlPayload(sql, {
			userId,
			sellBet: insertBetSqlPayload,
			//@ts-ignore - buyBetId is defined if type is sell
			buyBet,
			event
		});

		const sellBetSqlPayload = {
			...insertBetSqlPayload,
			profit,
			platform_commission: platformCommission
		};

		return [sellBetSqlPayload, payoutTxSqlPayload];
	}

	return [insertBetSqlPayload, null];
};

const placeBet = async (userId: string, payload: EventSchema.PlaceBetPayload) => {
	const { price, quantity, eventId, type, buyBetId, optionId } = payload;

	const { selectedOption, otherOption } = await _validateOption(eventId, optionId);

	const betId = createId();
	const totalPrice = price * quantity;

	const insertBetTxSqlPayload: InsertBetTxSqlPayload[] = [];
	let reward_amount_used = 0;

	return await db.sql.begin(async (sql) => {
		//Event validation is done inside the transaction to avoid the possibility of event getting completed after the validation
		const event = await _validateEvent(sql, eventId);
		if (event.win_price < price) throw new ErrorUtil.HttpException(400, "Price is higher than win price.");

		//Fetching buy bet if the order is a sell bet to validate the quantity. Casting buy_bet_id as string because it's already validated in the graphql resolver
		const [buyBet] = z.array(Bet).parse(
			type === "sell"
				? await _buyBetValidation(sql, {
						userId,
						event,
						selectedOption,
						buyBetId: buyBetId as string
					})
				: []
		);

		if (type === "buy") {
			const betTxSqlPayload = await _checkBalanceAndReturnBetTxSqlPayload(sql, {
				userId,
				event,
				totalPrice,
				betId,
				quantity
			});
			insertBetTxSqlPayload.push(betTxSqlPayload);
			//Assigning negative value because we are getting the information from debit transaction
			reward_amount_used = -betTxSqlPayload.reward_amount;
		} else reward_amount_used = await _validateSellBetAndUpdateBuyBet(sql, { buyBet, quantity, totalPrice });

		const {
			remainingQuantity,
			updateBetSqlPayload,
			insertMatchedBetSqlPayload,
			insertBetTxSqlPayload: _insertBetTxSqlPayload
		} = await _matchOrders(sql, {
			event,
			betId,
			selectedOption,
			otherOption,
			type,
			price,
			quantity
		});

		insertBetTxSqlPayload.push(..._insertBetTxSqlPayload);

		const [bet, insertSellBetTxSqlPayload] = await _getInsertBetTxSqlPayload(sql, {
			userId,
			betId,
			option: selectedOption,
			event,
			price,
			rewardAmountUsed: reward_amount_used,
			quantity,
			remainingQuantity,
			type,
			buyBet
		});

		if (insertSellBetTxSqlPayload) insertBetTxSqlPayload.push(insertSellBetTxSqlPayload);

		const [res] = z.array(Bet).parse(await sql`INSERT INTO "event".bet ${sql(bet)}`);

		if (updateBetSqlPayload.length) {
			const payload = updateBetSqlPayload.map(({ id, unmatched_quantity, profit, platform_commission }) => [id, unmatched_quantity, profit, platform_commission]);

			//noinspection SqlResolve
			updateBetSqlPayload.length &&
				(await sql`
          UPDATE "event".bet
          SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
              profit              = (update_data.profit)::decimal,
              platform_commission = (update_data.platform_commission)::decimal,
              updated_at          = NOW()
          FROM (VALUES ${
						//@ts-ignore
						sql(payload)
					}) AS update_data (id, unmatched_quantity, profit, platform_commission)
          WHERE "event".bet.id = update_data.id
			`);
		}

		insertBetTxSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(insertBetTxSqlPayload)}`);
		insertMatchedBetSqlPayload.length && (await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`);
		return res;
	});
};

const _getLiquidityMatchableBets = async () =>
	z.array(Bet).parse(
		await db.sql`
        SELECT bet.*
        FROM "event".bet
                 JOIN "event".event ON bet.event_id = event.id
        WHERE event.status = 'live'
          AND event.frozen = false
          AND bet.user_id IS NOT NULL
          AND bet.unmatched_quantity > 0
          AND bet.price_per_quantity <= event.platform_liquidity_left
          AND bet.updated_at < NOW() - INTERVAL '20 seconds'
        ORDER BY bet.price_per_quantity * bet.quantity DESC, bet.created_at`
	);

const _placeCounterLiquidityBet = async (sql: TransactionSql, { bet, event, selectedOption, otherOption, quantity }: PlaceCounterLiquidityBetPayload) => {
	let insertBetSellTxSqlPayload: InsertBetTxSqlPayload | null = null;

	const commonBetBody = {
		id: createId(),
		event_id: bet.event_id,
		user_id: null,
		quantity,
		type: BetType.Values.buy,
		sold_quantity: 0,
		reward_amount_used: 0,
		unmatched_quantity: 0,
		buy_bet_id: null,
		profit: null,
		platform_commission: null,
		created_at: new Date(),
		updated_at: new Date()
	};

	let counterBet: Bet;

	if (bet.type === "sell") {
		counterBet = {
			option_id: selectedOption.id,
			price_per_quantity: bet.price_per_quantity,
			...commonBetBody
		};

		const unmatchedQuantity = bet.unmatched_quantity - quantity;

		if (unmatchedQuantity === 0) {
			const { payoutTxSqlPayload, profit, platformCommission } = await _getSellPayoutTxSqlPayload(sql, {
				userId: bet.user_id as string,
				sellBet: bet,
				event
			});

			insertBetSellTxSqlPayload = payoutTxSqlPayload;
			bet = {
				...bet,
				profit,
				platform_commission: platformCommission
			};
		}
	} else {
		counterBet = {
			option_id: otherOption.id,
			price_per_quantity: event.win_price - bet.price_per_quantity,
			...commonBetBody
		};
	}

	const insertMatchedBetSqlPayload: InsertMatchedBetSqlPayload = {
		bet_id: bet.id,
		matched_bet_id: commonBetBody.id,
		quantity
	};

	const updateBetSqlPayload = {
		profit: bet.profit,
		platform_commission: bet.platform_commission,
		unmatched_quantity: bet.unmatched_quantity - quantity,
		updated_at: new Date()
	};

	await sql`INSERT INTO "event".bet ${sql(counterBet)}`;
	await sql`UPDATE "event".bet
            SET ${sql(updateBetSqlPayload)}
            WHERE id = ${bet.id}`;
	await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`;
	insertBetSellTxSqlPayload && (await sql`INSERT INTO "wallet".transaction ${sql(insertBetSellTxSqlPayload)}`);

	return {
		...counterBet,
		type: BetType.Values.sell,
		unmatched_quantity: quantity,
		sold_quantity: null,
		buy_bet_id: counterBet.id
	};
};

const _matchWithLiquidityEngine = async (bet: Bet) => {
	await db.sql.begin(async (sql) => {
		const event = await _validateEvent(sql, bet.event_id);

		if (bet.price_per_quantity > event.platform_liquidity_left) return;
		const liquidityMatchableQuantity = Math.floor(event.platform_liquidity_left / bet.price_per_quantity);
		const { selectedOption, otherOption } = await _validateOption(event.id, bet.option_id);

		const counterSellBet = await _placeCounterLiquidityBet(sql, {
			bet,
			event,
			selectedOption,
			otherOption,
			quantity: liquidityMatchableQuantity
		});
	});
};

const liquidityEngine = async () => {
	const bets = await _getLiquidityMatchableBets();

	for (const bet of bets) {
		await _matchWithLiquidityEngine(bet);
	}
};

setInterval(liquidityEngine, 20 * 1000);

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

export type { Category, Event, Option, Source, Bet };

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
	placeBet
};
