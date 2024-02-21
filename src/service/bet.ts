import { createId } from "@paralleldrive/cuid2";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { db } from "../config";
import { EventSchema } from "../schema";
import { ErrorUtil } from "../util";
import { Event, getEvent, getEventOptions, Option } from "./event.ts";
import { generateTxSqlPayload, getUserTokenBalance, type Transaction } from "./wallet.ts";

const BetType = z.enum(["buy", "sell"]);
type BetType = z.infer<typeof BetType>;

const Bet = z.object({
	id: z.string().default(() => createId()),
	eventId: z.string(),
	userId: z.string().nullable().default(null),
	optionId: z.coerce.number().int(),
	quantity: z.coerce.number().int(),
	pricePerQuantity: z.coerce.number(),
	rewardAmountUsed: z.coerce.number(),
	unmatchedQuantity: z.coerce.number().int(),
	type: BetType,
	buyBetId: z.string().nullable().default(null),
	profit: z.coerce.number().nullable().default(null),
	platformCommission: z.coerce.number().nullable().default(null),
	soldQuantity: z.coerce.number().int().nullable().default(null),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date())
});
type Bet = z.infer<typeof Bet>;

const checkUserLockStatus = async (sql: TransactionSql, userId: string) => {
	const [{ locked }]: [
		{
			locked: boolean;
		}
	] = await sql`SELECT pg_try_advisory_xact_lock(hashtext(${userId})) AS locked`;

	return !locked;
};

const getBet = async (sql: TransactionSql | Sql, betId: string): Promise<Bet> => {
	const [bet] = z.array(Bet).parse(
		await sql`SELECT *
              FROM "event".bet
              WHERE id = ${betId}`
	);

	if (!bet) throw new ErrorUtil.HttpException(400, "Bet not found.");
	return bet;
};

const validateOption = async (
	eventId: string,
	optionId: number
): Promise<{
	selectedOption: Option;
	otherOption: Option;
}> => {
	const options = await getEventOptions(eventId);

	const selectedOption = options.find((option) => option.id === optionId);
	if (!selectedOption) throw new ErrorUtil.HttpException(400, "Invalid option id.");
	const otherOption = options.find((option) => option.id !== optionId) as Option;

	return { selectedOption, otherOption };
};

const validateEvent = async (sql: TransactionSql, eventId: string, price?: number): Promise<Event> => {
	const [event] = z.array(Event).parse(
		await sql`SELECT *
              FROM "event".event
              WHERE id = ${eventId};`
	);

	if (!event) throw new ErrorUtil.HttpException(400, "Event not found.");
	if (event.status !== "live") throw new ErrorUtil.HttpException(400, "Only live events are allowed for betting/cancelling.");
	if (event.frozen) throw new ErrorUtil.HttpException(400, "Betting/Cancelling is locked for this event.");
	if (price && event.winPrice < price) throw new ErrorUtil.HttpException(400, "Price per quantity is higher than the win price.");

	return event;
};

const validateBetPrice = async (
	sql: TransactionSql,
	userId: string,
	event: Event,
	totalPrice: number
): Promise<{
	amount: number;
	rewardAmountUsed: number;
}> => {
	const { rewardBalance, totalBalance } = await getUserTokenBalance(sql, userId, event.token, event.chain);

	if (totalBalance < totalPrice) throw new ErrorUtil.HttpException(400, "Insufficient balance.");

	//Reward amount have priority over the main balance
	const rewardAmountUsed = totalPrice < rewardBalance ? totalPrice : rewardBalance;
	const amount = totalPrice - rewardAmountUsed;

	return { amount, rewardAmountUsed };
};

const validateBuyBet = async (sql: TransactionSql, userId: string, eventId: string, selectedOption: number, buyBetId: string): Promise<Bet> => {
	const [bet] = z.array(Bet).parse(
		await sql`
        SELECT *
        FROM "event".bet
        WHERE id = ${buyBetId}
          AND event_id = ${eventId}
          AND user_id = ${userId}
          AND type = 'buy'
          AND option_id = ${selectedOption}
		`
	);

	if (!bet) throw new ErrorUtil.HttpException(400, "Invalid buy bet id.");

	return bet;
};

const validateSellBet = async (sql: TransactionSql, totalPrice: number, quantity: number, buyBet: Bet) => {
	const matchedQuantity = buyBet.quantity - buyBet.unmatchedQuantity;
	if (matchedQuantity < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than matched quantity.");

	//Sold quantity will always be a number because it's a buy bet. So, casting it as number
	if (matchedQuantity - (buyBet.soldQuantity as number) < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than remaining matched quantity.");

	//We are moving the reward amount from buy bet to sell bet to avoid double payouts
	const rewardAmountUsed = totalPrice < buyBet.rewardAmountUsed ? totalPrice : buyBet.rewardAmountUsed;

	await sql`UPDATE "event".bet
            SET sold_quantity      = sold_quantity + ${quantity},
                reward_amount_used = reward_amount_used - ${rewardAmountUsed},
                updated_at         = ${new Date()}
            WHERE id = ${buyBet.id}`;

	return rewardAmountUsed;
};

const generateInsertBetSqlPayload = (
	userId: string | null,
	eventId: string,
	optionId: number,
	pricePerQuantity: number,
	rewardAmountUsed: number,
	quantity: number,
	type: BetType,
	soldQuantity: number | null = null,
	buyBetId: string | null = null,
	unmatchedQuantity: number = quantity
) => {
	const payload = {
		userId,
		eventId,
		optionId,
		pricePerQuantity,
		rewardAmountUsed,
		unmatchedQuantity,
		quantity,
		type,
		buyBetId,
		soldQuantity,
		createdAt: new Date(),
		updatedAt: new Date()
	};

	return Bet.parse(payload);
};

const addToBetQueue = async (sql: TransactionSql, bet: Bet) =>
	sql`INSERT INTO "event".bet_queue
      VALUES (${bet.id}, ${bet.eventId})`;

const getUnmatchedOrders = async (sql: TransactionSql, event: Event, type: BetType, price: number, quantity: number, selectedOption: number, otherOption: number) =>
	z.array(Bet).parse(
		await sql`
        WITH unmatched_orders AS (SELECT *,
                                         quantity * price_per_quantity                                  AS total_price,
                                         SUM(unmatched_quantity)
                                         OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
                                  FROM "event".bet
                                  WHERE event_id = ${event.id}
                                    AND unmatched_quantity > 0
                                    AND ${
																			type === "buy"
																				? sql`(( "type" = 'buy' AND option_id = ${otherOption} AND price_per_quantity BETWEEN ${event.winPrice - price - event.slippage} AND ${event.winPrice - price + event.slippage}) OR (type = 'sell' AND option_id = ${selectedOption} AND price_per_quantity BETWEEN ${price - event.slippage} AND ${price + event.slippage}))`
																				: sql`type
                                                = 'buy' AND option_id =
                                                ${selectedOption}
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
		`
	);

const getUnmatchedOrdersForAdmin = async (sql: TransactionSql, event: Event, price: number, quantity: number, selectedOption: number) =>
	z.array(Bet).parse(
		await sql`
        WITH unmatched_orders AS (SELECT *,
                                         quantity * price_per_quantity                                  AS total_price,
                                         SUM(unmatched_quantity)
                                         OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
                                  FROM "event".bet
                                  WHERE event_id = ${event.id}
                                    AND unmatched_quantity > 0
                                    AND user_id IS NOT NULL
                                    AND type
                                      = 'buy'
                                    AND option_id =
                                        ${selectedOption}
                                    AND price_per_quantity
                                      BETWEEN
                                      ${price - event.slippage}
                                      AND
                                      ${price + event.slippage})
        SELECT *
        FROM unmatched_orders
        WHERE cum_sum <= ${quantity}
        UNION
        (SELECT *
         FROM unmatched_orders
         WHERE cum_sum >= ${quantity}
         LIMIT 1)
        ORDER BY total_price DESC, created_at;
		`
	);

const getSellPayoutTxSqlPayload = async (event: Event, sellBet: Bet, buyBet: Bet) => {
	const buyBetTotal = buyBet.pricePerQuantity * sellBet.quantity;
	const sellBetTotal = sellBet.pricePerQuantity * sellBet.quantity;

	const earned = sellBetTotal - buyBetTotal;
	const commission = earned > 0 ? (sellBetTotal * event.platformFeesPercentage) / 100 : 0;
	const profit = earned - commission < 0 ? earned : earned - commission;
	//Platform commission is only taken if profit is greater than 0 after deducting the commission
	const platformCommission = profit === earned ? 0 : commission;
	const amount = sellBetTotal - platformCommission - sellBet.rewardAmountUsed;

	const payoutTxSqlPayload = generateTxSqlPayload(sellBet.userId as string, "bet", amount, sellBet.rewardAmountUsed, event.token, event.chain, null, "completed", sellBet.id, sellBet.quantity);

	return { payoutTxSqlPayload, profit, platformCommission };
};

//Not using NOT IN BETWEEN because it's not inclusive
const getLiquidityMatchableBets = async () =>
	z.array(Bet).parse(
		await db.sql`
        SELECT bet.*
        FROM "event".bet
                 JOIN "event".event ON bet.event_id = event.id
        WHERE event.status = 'live'
          AND event.frozen = false
          AND bet.user_id IS NOT NULL
          AND bet.unmatched_quantity > 0
          AND bet.updated_at < NOW() - INTERVAL '20 seconds'
          AND ((bet.type = 'sell' AND bet.price_per_quantity <= event.platform_liquidity_left) OR
               (bet.type = 'buy' AND event.win_price - bet.price_per_quantity <= event.platform_liquidity_left))
          AND ((event.liquidity_in_between = false AND
                (bet.price_per_quantity <= event.win_price * event.min_liquidity_percentage / 100 OR
                 bet.price_per_quantity >= event.win_price * event.max_liquidity_percentage / 100))
            OR (event.liquidity_in_between = true AND
                bet.price_per_quantity BETWEEN event.win_price * event.min_liquidity_percentage / 100 AND event.win_price * event.max_liquidity_percentage / 100))
        ORDER BY bet.price_per_quantity * bet.quantity DESC, bet.created_at`
	);

const placeCounterLiquidityBet = async (sql: TransactionSql, bet: Bet, event: Event, selectedOption: number, otherOption: number, quantity: number) => {
	let counterBuyBet: Bet;
	const unmatchedQuantity = bet.unmatchedQuantity - quantity;

	if (bet.type === "sell") {
		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, selectedOption, bet.pricePerQuantity, 0, quantity, "buy", quantity, null, unmatchedQuantity);

		if (unmatchedQuantity === 0) {
			const buyBet = await getBet(sql, bet.buyBetId as string);
			const { payoutTxSqlPayload, profit, platformCommission } = await getSellPayoutTxSqlPayload(event, bet, buyBet);

			await sql`INSERT INTO "wallet".transaction ${sql(payoutTxSqlPayload)}`;

			bet = {
				...bet,
				profit,
				platformCommission,
				unmatchedQuantity
			};
		}
	} else {
		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, otherOption, event.winPrice - bet.pricePerQuantity, 0, quantity, "buy", quantity, null, unmatchedQuantity);
	}

	const insertMatchedBetSqlPayload = {
		betId: counterBuyBet.id,
		matchedBetId: bet.id,
		quantity
	};

	const updateBetSqlPayload = {
		profit: bet.profit,
		platformCommission: bet.platformCommission,
		unmatchedQuantity,
		updated_at: new Date()
	};
	await sql`INSERT INTO "event".bet ${sql(counterBuyBet)}`;
	await sql`UPDATE "event".bet
	          SET ${sql(updateBetSqlPayload)}
	          WHERE id = ${bet.id}`;

	await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`;
	await sql`UPDATE "event".event
	          SET platform_liquidity_left = platform_liquidity_left - ${counterBuyBet.pricePerQuantity * quantity},
	              updated_at            = ${new Date()}
	          WHERE id = ${event.id}`;

	const counterSellBet = generateInsertBetSqlPayload(null, bet.eventId, counterBuyBet.optionId, counterBuyBet.pricePerQuantity, 0, quantity, "sell", null, counterBuyBet.id, quantity);

	const res = Bet.parse((await sql`INSERT INTO "event".bet ${sql(counterSellBet)} RETURNING *`)[0]);
	await addToBetQueue(sql, res);
};

const matchWithLiquidityEngine = async (bet: Bet) => {
	const { selectedOption, otherOption } = await validateOption(bet.eventId, bet.optionId);

	await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${bet.eventId}))`;
		const event = await getEvent(sql, bet.eventId);

		//Fetch bet again to check whether any other bet has already matched with it
		bet = await getBet(sql, bet.id);

		const pricePerQuantity = bet.type === "sell" ? bet.pricePerQuantity : event.winPrice - bet.pricePerQuantity;
		if (pricePerQuantity > event.platformLiquidityLeft) return;
		const liquidityMatchableQuantity = Math.floor(event.platformLiquidityLeft / pricePerQuantity);

		await placeCounterLiquidityBet(sql, bet, event, selectedOption.id, otherOption.id, liquidityMatchableQuantity > bet.unmatchedQuantity ? bet.unmatchedQuantity : liquidityMatchableQuantity);
	});
};

const matchOrder = async (betId: string, eventId: string) => {
	const insertMatchedBetSqlPayload: {
		betId: string;
		matchedBetId: string;
		quantity: number;
	}[] = [];

	const insertSellPayoutTxSqlPayload: Transaction[] = [];

	const updateBetSqlPayload: {
		id: string;
		unmatchedQuantity: number;
		profit: number | null;
		platformCommission: number | null;
	}[] = [];

	const addUpdateBetSqlPayload = (betId: string, unmatchedQuantity: number, profit: number | null = null, platformCommission: number | null = null) =>
		updateBetSqlPayload.push({
			id: betId,
			unmatchedQuantity,
			profit,
			platformCommission
		});

	await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
		const bet = await getBet(sql, betId);
		const { optionId, unmatchedQuantity, type, pricePerQuantity } = bet;
		const event = await getEvent(sql, eventId);
		const { selectedOption, otherOption } = await validateOption(eventId, optionId);

		const unmatchedOrders = bet.userId
			? await getUnmatchedOrders(sql, event, type, pricePerQuantity, unmatchedQuantity, selectedOption.id, otherOption.id)
			: await getUnmatchedOrdersForAdmin(sql, event, pricePerQuantity, unmatchedQuantity, selectedOption.id);
		let remainingQuantity = unmatchedQuantity;

		for (const order of unmatchedOrders) {
			if (remainingQuantity === 0) break;

			const matchedQuantity = remainingQuantity < order.unmatchedQuantity ? remainingQuantity : order.unmatchedQuantity;
			remainingQuantity -= matchedQuantity;

			insertMatchedBetSqlPayload.push({
				betId: betId,
				matchedBetId: order.id,
				quantity: matchedQuantity
			});

			const unmatchedQuantity = order.unmatchedQuantity - matchedQuantity;

			if (order.type === "sell" && unmatchedQuantity === 0 && order.userId) {
				const buyBet = await getBet(sql, order.buyBetId as string);
				const { payoutTxSqlPayload, profit, platformCommission } = await getSellPayoutTxSqlPayload(event, order, buyBet);

				addUpdateBetSqlPayload(order.id, unmatchedQuantity, profit, platformCommission);
				insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
			} else {
				addUpdateBetSqlPayload(order.id, unmatchedQuantity);
			}
		}

		if (remainingQuantity === 0 && bet.type === "sell" && bet.userId) {
			const buyBet = await getBet(sql, bet.buyBetId as string);
			const { payoutTxSqlPayload, profit, platformCommission } = await getSellPayoutTxSqlPayload(event, bet, buyBet);

			addUpdateBetSqlPayload(bet.id, remainingQuantity, profit, platformCommission);
			insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
		} else if (unmatchedQuantity !== remainingQuantity) {
			addUpdateBetSqlPayload(bet.id, remainingQuantity);
		}

		if (updateBetSqlPayload.length) {
			const payload = updateBetSqlPayload.map(({ id, unmatchedQuantity, profit, platformCommission }) => [id, unmatchedQuantity, profit, platformCommission]);

			//noinspection SqlResolve
			updateBetSqlPayload.length &&
				(await sql`
          UPDATE "event".bet
          SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
              profit              = (update_data.profit)::decimal,
              platform_commission = (update_data.platform_commission)::decimal,
              updated_at          = ${new Date()}
          FROM (VALUES ${
						//@ts-ignore
						sql(payload)
					}) AS update_data (id, unmatched_quantity, profit, platform_commission)
          WHERE "event".bet.id = update_data.id
			`);
		}

		insertMatchedBetSqlPayload.length && (await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`);
		insertSellPayoutTxSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(insertSellPayoutTxSqlPayload)}`);

		await sql`DELETE
              FROM "event".bet_queue
              WHERE bet_id = ${betId}`;
	});
};

const placeBet = async (userId: string, payload: EventSchema.PlaceBetPayload): Promise<Bet> => {
	const { price, quantity, eventId, type, buyBetId, optionId } = payload;
	await validateOption(eventId, optionId);

	const betId = createId();
	const totalPrice = price * quantity;
	let insertBetSqlPayload: Bet;

	return await db.sql.begin(async (sql) => {
		if (await checkUserLockStatus(sql, userId)) throw new ErrorUtil.HttpException(429, "Only one bet order is allowed at a time.");
		const event = await validateEvent(sql, eventId, price);

		if (type === "buy") {
			const { amount, rewardAmountUsed } = await validateBetPrice(sql, userId, event, totalPrice);
			const insertBetTxSqlPayload = generateTxSqlPayload(userId, "bet", -amount, -rewardAmountUsed, event.token, event.chain, null, "completed", betId, quantity);
			await sql`INSERT INTO "wallet".transaction ${sql(insertBetTxSqlPayload)}`;
			insertBetSqlPayload = generateInsertBetSqlPayload(userId, eventId, optionId, price, rewardAmountUsed, quantity, type, 0);
		} else {
			if (!buyBetId) throw new ErrorUtil.HttpException(400, "Buy bet id is required for sell bet.");
			const buyBet = await validateBuyBet(sql, userId, eventId, optionId, buyBetId);
			const rewardAmountUsed = await validateSellBet(sql, totalPrice, quantity, buyBet);
			insertBetSqlPayload = generateInsertBetSqlPayload(userId, eventId, optionId, price, rewardAmountUsed, quantity, type, null, buyBetId);
		}

		const bet = Bet.parse((await sql`INSERT INTO "event".bet ${sql(insertBetSqlPayload)} RETURNING *`)[0]);
		await addToBetQueue(sql, bet);
		return bet;
	});
};

const cancelBet = async (userId: string, payload: EventSchema.CancelBetPayload): Promise<Bet> => {
	const { id, quantity, eventId } = payload;

	return await db.sql.begin(async (sql) => {
		if (await checkUserLockStatus(sql, userId)) throw new ErrorUtil.HttpException(429, "Only one bet order is allowed at a time.");
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
		const event = await validateEvent(sql, eventId);
		const bet = await getBet(sql, id);

		if (quantity > bet.unmatchedQuantity) throw new ErrorUtil.HttpException(400, "Quantity is higher than unmatched quantity.");

		const totalCancelAmount = bet.pricePerQuantity * quantity;
		const totalAmount = bet.pricePerQuantity * bet.quantity - bet.rewardAmountUsed;
		const rewardAmount = totalCancelAmount > totalAmount ? totalCancelAmount - totalAmount : 0;
		const amount = totalCancelAmount - rewardAmount;

		if (bet.type === "buy") {
			const insertBetTxSqlPayload = generateTxSqlPayload(userId, "bet_cancel", amount, rewardAmount, event.token, event.chain, null, "completed", id, quantity);
			await sql`INSERT INTO "wallet".transaction ${sql(insertBetTxSqlPayload)}`;
		} else {
			const betUpdatePayload = {
				sold_quantity: (bet.soldQuantity as number) - quantity,
				reward_amount_used: bet.rewardAmountUsed + rewardAmount,
				updated_at: new Date()
			};
			await sql`UPDATE "event".bet SET ${sql(betUpdatePayload)} WHERE id = ${bet.buyBetId}`;

			const unmatchedQuantity = bet.unmatchedQuantity - quantity;

			if (unmatchedQuantity === 0) {
				const buyBet = await getBet(sql, bet.buyBetId as string);

				const { payoutTxSqlPayload, profit, platformCommission } = await getSellPayoutTxSqlPayload(event, bet, buyBet);
				await sql`INSERT INTO "wallet".transaction ${sql(payoutTxSqlPayload)}`;

				const updateBetSqlPayload = {
					unmatchedQuantity,
					quantity: bet.quantity - quantity,
					profit,
					platform_commission: platformCommission,
					updatedAt: new Date()
				};

				return Bet.parse((await sql`UPDATE "event".bet SET ${sql(updateBetSqlPayload)} WHERE id = ${bet.id} RETURNING *`)[0]);
			}
		}

		const updateBetSqlPayload = {
			unmatchedQuantity: bet.unmatchedQuantity - quantity,
			quantity: bet.quantity - quantity,
			updatedAt: new Date()
		};

		return Bet.parse((await sql`UPDATE "event".bet SET ${sql(updateBetSqlPayload)} WHERE id = ${id} RETURNING *`)[0]);
	});
};

let runMatchQueueRunning = false;
const runMatchQueue = async () => {
	try {
		if (runMatchQueueRunning) return;
		runMatchQueueRunning = true;

		const bets = (await db.sql`
        SELECT *
        FROM "event".bet_queue
        ORDER BY created_at
		`) as [
			{
				betId: string;
				eventId: string;
			}
		];

		//@ts-ignore Not implemented in the stable typescript version yet
		const betsByEvents = Object.groupBy(bets, ({ eventId }) => eventId) as {
			[eventId: string]: {
				betId: string;
				eventId: string;
			}[];
		};

		await Promise.all(
			Object.keys(betsByEvents).map(async (event) => {
				for (const bet of betsByEvents[event]) {
					await matchOrder(bet.betId, bet.eventId);
				}
			})
		);

		runMatchQueueRunning = false;
	} catch (error) {
		console.error("Error running match queue", error);
		runMatchQueueRunning = false;
	}
};

let liquidityEngineRunning = false;
const liquidityEngine = async () => {
	try {
		if (liquidityEngineRunning) return;
		liquidityEngineRunning = true;
		const bets = await getLiquidityMatchableBets();

		for (const bet of bets) {
			await matchWithLiquidityEngine(bet);
		}

		liquidityEngineRunning = false;
	} catch (e) {
		console.error("Error running liquidityEngine", e);
		liquidityEngineRunning = false;
	}
};

setInterval(runMatchQueue, 5 * 1000);
setInterval(liquidityEngine, 20 * 1000);

export { Bet, placeBet, cancelBet };
