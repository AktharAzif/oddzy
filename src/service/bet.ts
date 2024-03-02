import { createId } from "@paralleldrive/cuid2";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { db } from "../config";
import { BetSchema } from "../schema";
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
	buyBetPricePerQuantity: z.coerce.number().nullable().default(null),
	profit: z.coerce.number().nullable().default(null),
	platformCommission: z.coerce.number().nullable().default(null),
	limitOrder: z.boolean().default(false),
	soldQuantity: z.coerce.number().int().nullable().default(null),
	createdAt: z.date().default(() => new Date()),
	updatedAt: z.date().default(() => new Date())
});
type Bet = z.infer<typeof Bet>;

/**
 * This function checks if a user is locked or not in the database.
 * It uses PostgreSQL's advisory lock system to prevent concurrent modifications.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {string} userId - The ID of the user to check the lock status for.
 *
 * @returns {Promise<boolean>} Returns a promise that resolves to a boolean.
 * The boolean is true if the user is not locked and false otherwise.
 */
const checkUserLockStatus = async (sql: TransactionSql, userId: string): Promise<boolean> => {
	const [{ locked }]: [
		{
			locked: boolean;
		}
	] = await sql`SELECT pg_try_advisory_xact_lock(hashtext(${userId})) AS locked`;

	return !locked;
};

/**
 * This function retrieves a bet from the database using its ID.
 *
 * @param {TransactionSql | Sql} sql - The SQL transaction object or SQL object.
 * @param {string} betId - The ID of the bet to retrieve.
 *
 * @returns {Promise<Bet>} Returns a promise that resolves to a Bet object.
 * If the bet is not found, it throws an HttpException with status 400.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the bet is not found.
 */
const getBet = async (sql: TransactionSql | Sql, betId: string): Promise<Bet> => {
	const [bet] = z.array(Bet).parse(
		await sql`SELECT *
              FROM "event".bet
              WHERE id = ${betId}`
	);

	if (!bet) throw new ErrorUtil.HttpException(400, "Bet not found.");
	return bet;
};

/**
 * This function retrieves bets from the database based on the provided eventId and userId.
 * If neither eventId nor userId is provided, it throws an HttpException with status 400.
 * The function also supports pagination through the page and limit parameters.
 *
 * @param {string | null} eventId - The ID of the event to retrieve bets for. Default is null.
 * @param {string | null} userId - The ID of the user to retrieve bets for. Default is null.
 * @param {number} page - The page number for pagination.
 * @param {number} limit - The number of bets to retrieve per page.
 *
 * @returns {Promise<BetSchema.BetPaginatedResponse>} Returns a promise that resolves to a BetPaginatedResponse object.
 * The BetPaginatedResponse object contains an array of Bet objects, the total number of bets, the current page number, and the limit.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if neither eventId nor userId is provided.
 */
const getBets = async (eventId: string | null = null, userId: string | null = null, page: number, limit: number): Promise<BetSchema.BetPaginatedResponse> => {
	if (!eventId && !userId) throw new ErrorUtil.HttpException(400, "EventId or UserId is required.");

	const bets = db.sql`SELECT *
                      FROM "event".bet
                      WHERE true
                          ${eventId ? db.sql`AND event_id = ${eventId}` : db.sql``} ${userId ? db.sql`AND user_id = ${userId}` : db.sql``}
                      ORDER BY created_at DESC
                      LIMIT ${limit} OFFSET ${page * limit}`;
	const total = db.sql`SELECT COUNT(*)
                       FROM "event".bet
                       WHERE true
                           ${eventId ? db.sql`AND event_id = ${eventId}` : db.sql``} ${userId ? db.sql`AND user_id = ${userId}` : db.sql``}` as Promise<
		[
			{
				count: string;
			}
		]
	>;

	const [betsRes, [totalRes]] = await Promise.all([bets, total]);

	return {
		bets: z.array(Bet).parse(betsRes),
		total: Number(totalRes.count),
		page: page + 1,
		limit
	};
};

/**
 * This function validates the selected option for a given event.
 *
 * @param {string} eventId - The ID of the event.
 * @param {number} optionId - The ID of the selected option.
 *
 * @returns {Promise<{selectedOption: Option, otherOption: Option}>} Returns a promise that resolves to an object containing the selected option and the other option.
 * The selected option is the option with the provided optionId.
 * The other option is the option that does not have the provided optionId.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the selected option is not found in the event.
 */
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

/**
 * This function validates an event for betting or cancelling.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {string} eventId - The ID of the event to validate.
 * @param {number} [price] - The price per quantity for the bet. Optional.
 *
 * @returns {Promise<Event>} Returns a promise that resolves to an Event object.
 * If the event is not live, it throws an HttpException with status 400.
 * If the event is frozen, it throws an HttpException with status 400.
 * If the price per quantity is higher than the win price, it throws an HttpException with status 400.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the event is not live, is frozen, or the price per quantity is higher than the win price.
 */
const validateEvent = async (sql: TransactionSql, eventId: string, price?: number): Promise<Event> => {
	const event = await getEvent(sql, eventId);

	if (event.status !== "live") throw new ErrorUtil.HttpException(400, "Only live events are allowed for betting/cancelling.");
	if (event.frozen) throw new ErrorUtil.HttpException(400, "Betting/Cancelling is locked for this event.");
	if (price && event.winPrice < price) throw new ErrorUtil.HttpException(400, "Price per quantity is higher than the win price.");

	return event;
};

/**
 * This function validates the total price of a bet against the user's balance.
 * It prioritizes the use of the user's reward balance over their main balance.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {string} userId - The ID of the user placing the bet.
 * @param {Event} event - The event object related to the bet.
 * @param {number} totalPrice - The total price of the bet.
 *
 * @returns {Promise<{amount: number, rewardAmountUsed: number}>} Returns a promise that resolves to an object containing the amount and rewardAmountUsed.
 * The amount is the total price minus the reward amount used.
 * The rewardAmountUsed is the amount of the reward balance used for the bet, which is either the total price or the reward balance, whichever is smaller.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the user's total balance (reward balance + main balance) is less than the total price of the bet.
 */
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

	const rewardAmountUsed = totalPrice < rewardBalance ? totalPrice : rewardBalance;
	const amount = totalPrice - rewardAmountUsed;

	return { amount, rewardAmountUsed };
};

/**
 * This function validates a buy bet for a given user and event.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {string} userId - The ID of the user placing the bet.
 * @param {string} eventId - The ID of the event related to the bet.
 * @param {number} selectedOption - The ID of the selected option for the bet.
 * @param {string} buyBetId - The ID of the buy bet to validate.
 *
 * @returns {Promise<Bet>} Returns a promise that resolves to a Bet object.
 * If the bet is not found or does not meet the validation criteria, it throws an HttpException with status 400.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the bet is not found or does not meet the validation criteria.
 */
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

/**
 * This function validates a sell bet for a given user and event.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {number} totalPrice - The total price of the sell bet.
 * @param {number} quantity - The quantity of the sell bet.
 * @param {Bet} buyBet - The buy bet object related to the sell bet.
 *
 * @returns {Promise<number>} Returns a promise that resolves to a number representing the reward amount used.
 * Sold quantity will always be a number because it's a buy bet. So, casting it as number
 * Reward amount used is moved from buy bet to sell bet to avoid double payouts
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the sell quantity is higher than matched quantity or remaining matched quantity.
 */
const validateSellBet = async (sql: TransactionSql, totalPrice: number, quantity: number, buyBet: Bet): Promise<number> => {
	const matchedQuantity = buyBet.quantity - buyBet.unmatchedQuantity;
	if (matchedQuantity < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than matched quantity.");

	if (matchedQuantity - (buyBet.soldQuantity as number) < quantity) throw new ErrorUtil.HttpException(400, "Sell quantity is higher than remaining matched quantity.");

	const rewardAmountUsed = totalPrice < buyBet.rewardAmountUsed ? totalPrice : buyBet.rewardAmountUsed;

	await sql`UPDATE "event".bet
            SET sold_quantity = sold_quantity + ${quantity},
                reward_amount_used = reward_amount_used - ${rewardAmountUsed},
                updated_at = ${new Date()}
            WHERE id = ${buyBet.id}`;

	return rewardAmountUsed;
};

/**
 * This function generates a payload for inserting a bet into the database.
 *
 * @param {string | null} userId - The ID of the user placing the bet. Null for platform bets.
 * @param {string} eventId - The ID of the event related to the bet.
 * @param {number} optionId - The ID of the selected option for the bet.
 * @param {number} pricePerQuantity - The price per quantity for the bet.
 * @param {number} rewardAmountUsed - The amount of the reward balance used for the bet.
 * @param {number} quantity - The quantity of the bet.
 * @param {BetType} type - The type of the bet (buy or sell).
 * @param {boolean} [limitOrder=false] - Whether the bet is a limit order. Default is false.
 * @param {number | null} [soldQuantity=null] - The quantity of the bet that has been sold. Null for sell orders.
 * @param {string | null} [buyBetId=null] - The ID of the buy bet related to the sell bet. Null for buy bets.
 * @param {number | null} [buyBetPricePerQuantity=null] - The price per quantity of the buy bet related to the sell bet. Null for buy bets.
 * @param {number} [unmatchedQuantity=quantity] - The quantity of the bet that has not been matched. Default is the total quantity of the bet.
 *
 * @returns {Bet} Returns a Bet object.
 * The Bet object is validated using the Bet zod schema.
 */
const generateInsertBetSqlPayload = (
	userId: string | null,
	eventId: string,
	optionId: number,
	pricePerQuantity: number,
	rewardAmountUsed: number,
	quantity: number,
	type: BetType,
	limitOrder: boolean = false,
	soldQuantity: number | null = null,
	buyBetId: string | null = null,
	buyBetPricePerQuantity: number | null = null,
	unmatchedQuantity: number = quantity
): Bet => {
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
		limitOrder,
		buyBetPricePerQuantity
	};

	return Bet.parse(payload);
};

/**
 * This function adds a bet to the bet queue in the database.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Bet} bet - The bet object to be added to the queue.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the bet has been added to the queue.
 */
const addToBetQueue = async (sql: TransactionSql, bet: Bet): Promise<void> => {
	await sql`INSERT INTO "event".bet_queue
            VALUES (${bet.id}, ${bet.eventId})`;
};

/**
 * This function places a bet for a given user and event.
 *
 * @param {string} userId - The ID of the user placing the bet.
 * @param {BetSchema.PlaceBetPayload} payload - The payload containing the details of the bet.
 *
 * @returns {Promise<Bet>} Returns a promise that resolves to a Bet object.
 * The Bet object is the result of the placed bet.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if user tries to place simultaneous buy or sell bet.
 * @throws {ErrorUtil.HttpException} Throws an HttpException iif buy bet is not provided for sell bet.
 */
const placeBet = async (userId: string, payload: BetSchema.PlaceBetPayload): Promise<Bet> => {
	const { price: _price, quantity, eventId, type, buyBetId, optionId } = payload;
	const { selectedOption } = await validateOption(eventId, optionId);

	const limitOrder = !!_price;
	const price = _price || selectedOption.price;
	const totalPrice = price * quantity;

	let insertBetSqlPayload: Bet;
	let insertBetTxSqlPayload: Transaction;

	return await db.sql.begin(async (sql) => {
		if (await checkUserLockStatus(sql, userId)) throw new ErrorUtil.HttpException(429, "Only one bet order is allowed at a time.");
		const event = await validateEvent(sql, eventId, price);

		if (type === "buy") {
			const { amount, rewardAmountUsed } = await validateBetPrice(sql, userId, event, totalPrice);
			insertBetSqlPayload = generateInsertBetSqlPayload(userId, eventId, optionId, price, rewardAmountUsed, quantity, type, limitOrder, 0);
			insertBetTxSqlPayload = generateTxSqlPayload(userId, "bet", -amount, -rewardAmountUsed, event.token, event.chain, null, "completed", insertBetSqlPayload.id, quantity);
		} else {
			if (!buyBetId) throw new ErrorUtil.HttpException(400, "Buy bet id is required for sell bet.");
			const buyBet = await validateBuyBet(sql, userId, eventId, optionId, buyBetId);
			const rewardAmountUsed = await validateSellBet(sql, totalPrice, quantity, buyBet);
			insertBetSqlPayload = generateInsertBetSqlPayload(userId, eventId, optionId, price, rewardAmountUsed, quantity, type, limitOrder, null, buyBetId, buyBet.pricePerQuantity);
		}

		const bet = Bet.parse((await sql`INSERT INTO "event".bet ${sql(insertBetSqlPayload)} RETURNING *`)[0]);
		insertBetTxSqlPayload && (await sql`INSERT INTO "wallet".transaction ${sql(insertBetTxSqlPayload)}`);
		await addToBetQueue(sql, bet);
		return bet;
	});
};

//
// const getProfitAndCommission = (quantity: number, initialPrice: number, finalPrice: number, platformFees: number) => {
// 	const initialPriceTotal = quantity * initialPrice;
// 	const finalPriceTotal = quantity * finalPrice;
//
// 	const earned = finalPriceTotal - initialPriceTotal;
// 	const commission = earned > 0 ? (finalPriceTotal * platformFees) / 100 : 0;
// 	const profit = earned - commission < 0 ? earned : earned - commission;
// 	const platformCommission = profit === earned ? 0 : commission;
// 	const amount = finalPriceTotal - platformCommission;
//
// 	return { amount, profit, platformCommission };
// };
//
// const getSellPayoutTxSqlPayload = (event: Event, sellBet: Bet) => {
// 	//sellBet will always have butBetPricePerQuantity as number because it's a sell bet. So, casting it as number
// 	const { amount: _amount, profit, platformCommission } = getProfitAndCommission(sellBet.quantity, sellBet.buyBetPricePerQuantity as number, sellBet.pricePerQuantity, event.platformFeesPercentage);
// 	const amount = _amount - sellBet.rewardAmountUsed;
//
// 	const payoutTxSqlPayload = generateTxSqlPayload(sellBet.userId as string, "bet", amount, sellBet.rewardAmountUsed, event.token, event.chain, null, "completed", sellBet.id, sellBet.quantity);
//
// 	return { payoutTxSqlPayload, profit, platformCommission };
// };
//
// const getCancelBetSqlPayload = (bet: Bet, event: Event, quantity: number) => {
// 	const totalCancelAmount = bet.pricePerQuantity * quantity;
// 	const totalAmount = bet.pricePerQuantity * bet.quantity - bet.rewardAmountUsed;
//
// 	//Since reward amount have priority during placing the bet, we will be refunding the main balance first
// 	const rewardAmount = totalCancelAmount > totalAmount ? totalCancelAmount - totalAmount : 0;
// 	const amount = totalCancelAmount - rewardAmount;
//
// 	const updateBetSqlPayload = {
// 		id: bet.id,
// 		unmatchedQuantity: bet.unmatchedQuantity - quantity,
// 		rewardAmountUsed: bet.rewardAmountUsed - rewardAmount,
// 		quantity: bet.quantity - quantity,
// 		profit: null,
// 		platformCommission: null,
// 		updatedAt: new Date()
// 	};
//
// 	let updateBuyBetSqlPayload: {
// 		id: string;
// 		soldQuantityReturn: number;
// 		rewardAmountReturn: number;
// 		updatedAt: Date;
// 	} | null = null;
//
// 	let txSqlPayload: Transaction | null = null;
//
// 	if (bet.type === "buy" && bet.userId) {
// 		txSqlPayload = generateTxSqlPayload(bet.userId, "bet_cancel", amount, rewardAmount, event.token, event.chain, null, "completed", bet.id, quantity);
// 	} else {
// 		updateBuyBetSqlPayload = {
// 			id: bet.buyBetId as string,
// 			soldQuantityReturn: quantity,
// 			rewardAmountReturn: rewardAmount,
// 			updatedAt: new Date()
// 		};
//
// 		const unmatchedQuantity = bet.unmatchedQuantity - quantity;
// 		if (bet.userId && unmatchedQuantity === 0) {
// 			if (updateBetSqlPayload.quantity) {
// 				const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, {
// 					...bet,
// 					quantity: updateBetSqlPayload.quantity
// 				});
//
// 				txSqlPayload = payoutTxSqlPayload;
//
// 				return {
// 					updateBetSqlPayload: {
// 						...updateBetSqlPayload,
// 						profit,
// 						platformCommission
// 					},
// 					txSqlPayload,
// 					updateBuyBetSqlPayload
// 				};
// 			} else {
// 				return {
// 					updateBetSqlPayload: {
// 						...updateBetSqlPayload,
// 						profit: 0,
// 						platformCommission: 0
// 					},
// 					txSqlPayload,
// 					updateBuyBetSqlPayload
// 				};
// 			}
// 		}
// 	}
//
// 	return {
// 		updateBetSqlPayload,
// 		txSqlPayload,
// 		updateBuyBetSqlPayload
// 	};
// };
//
// const cancelBet = async (userId: string, payload: EventSchema.CancelBetPayload): Promise<Bet> => {
// 	const { id, quantity, eventId } = payload;
//
// 	return await db.sql.begin(async (sql) => {
// 		if (await checkUserLockStatus(sql, userId)) throw new ErrorUtil.HttpException(429, "Only one bet order is allowed at a time.");
// 		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
// 		const event = await validateEvent(sql, eventId);
// 		const bet = await getBet(sql, id);
//
// 		if (quantity > bet.unmatchedQuantity) throw new ErrorUtil.HttpException(400, "Quantity is higher than unmatched quantity.");
//
// 		const { updateBetSqlPayload: _updateBetSqlPayload, txSqlPayload, updateBuyBetSqlPayload } = getCancelBetSqlPayload(bet, event, quantity);
//
// 		const { id: _, ...updateBetSqlPayload } = _updateBetSqlPayload;
//
// 		updateBuyBetSqlPayload &&
// 			(await sql`UPDATE "event".bet
//                SET sold_quantity      = sold_quantity - ${updateBuyBetSqlPayload.soldQuantityReturn},
//                    reward_amount_used = reward_amount_used + ${updateBuyBetSqlPayload.rewardAmountReturn},
//                    updated_at         = ${updateBuyBetSqlPayload.updatedAt}
//                WHERE id = ${updateBuyBetSqlPayload.id}`);
//
// 		txSqlPayload && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);
//
// 		return Bet.parse(
// 			(
// 				await sql`UPDATE "event".bet
//                   SET ${sql(updateBetSqlPayload)}
//                   WHERE id = ${bet.id}
//                   RETURNING *`
// 			)[0]
// 		);
// 	});
// };
//
// const getUnmatchedOrders = async (sql: TransactionSql, event: Event, type: BetType, price: number, quantity: number, selectedOption: number, otherOption: number) =>
// 	z.array(Bet).parse(
// 		await sql`
//         WITH unmatched_orders AS (SELECT *,
//                                          quantity * price_per_quantity                                  AS total_price,
//                                          SUM(unmatched_quantity)
//                                          OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
//                                   FROM "event".bet
//                                   WHERE event_id = ${event.id}
//                                     AND unmatched_quantity > 0
//                                     AND ${
// 																			type === "buy"
// 																				? sql`(( "type" = 'buy' AND option_id = ${otherOption} AND price_per_quantity BETWEEN ${event.winPrice - price - event.slippage} AND ${event.winPrice - price + event.slippage}) OR (type = 'sell' AND option_id = ${selectedOption} AND price_per_quantity BETWEEN ${price - event.slippage} AND ${price + event.slippage}))`
// 																				: sql`type
//                                                 = 'buy' AND option_id =
//                                                 ${selectedOption}
//                                                 AND
//                                                 price_per_quantity
//                                                 BETWEEN
//                                                 ${price - event.slippage}
//                                                 AND
//                                                 ${price + event.slippage}`
// 																		})
//         SELECT *
//         FROM unmatched_orders
//         WHERE cum_sum <= ${quantity}
//         UNION
//         (SELECT *
//          FROM unmatched_orders
//          WHERE cum_sum >= ${quantity}
//          LIMIT 1)
//         ORDER BY total_price DESC, created_at;
// 		`
// 	);
//
// const getUnmatchedOrdersForAdmin = async (sql: TransactionSql, event: Event, price: number, quantity: number, selectedOption: number) =>
// 	z.array(Bet).parse(
// 		await sql`
//         WITH unmatched_orders AS (SELECT *,
//                                          quantity * price_per_quantity                                  AS total_price,
//                                          SUM(unmatched_quantity)
//                                          OVER (ORDER BY quantity * price_per_quantity DESC, created_at) AS cum_sum
//                                   FROM "event".bet
//                                   WHERE event_id = ${event.id}
//                                     AND unmatched_quantity > 0
//                                     AND user_id IS NOT NULL
//                                     AND type
//                                       = 'buy'
//                                     AND option_id =
//                                         ${selectedOption}
//                                     AND price_per_quantity
//                                       BETWEEN
//                                       ${price - event.slippage}
//                                       AND
//                                       ${price + event.slippage})
//         SELECT *
//         FROM unmatched_orders
//         WHERE cum_sum <= ${quantity}
//         UNION
//         (SELECT *
//          FROM unmatched_orders
//          WHERE cum_sum >= ${quantity}
//          LIMIT 1)
//         ORDER BY total_price DESC, created_at;
// 		`
// 	);
//
// const removeBetFromQueue = async (sql: TransactionSql, betId: string) =>
// 	sql`DELETE
//       FROM "event".bet_queue
//       WHERE bet_id = ${betId}`;
//
// const matchOrder = async (betId: string, eventId: string) => {
// 	const insertMatchedBetSqlPayload: {
// 		betId: string;
// 		matchedBetId: string;
// 		quantity: number;
// 		createdAt: Date;
// 	}[] = [];
//
// 	const insertSellPayoutTxSqlPayload: Transaction[] = [];
//
// 	const updateBetSqlPayload: {
// 		id: string;
// 		unmatchedQuantity: number;
// 		profit: number | null;
// 		platformCommission: number | null;
// 		updatedAt: Date;
// 	}[] = [];
//
// 	const addUpdateBetSqlPayload = (betId: string, unmatchedQuantity: number, profit: number | null = null, platformCommission: number | null = null) =>
// 		updateBetSqlPayload.push({
// 			id: betId,
// 			unmatchedQuantity,
// 			profit,
// 			platformCommission,
// 			updatedAt: new Date()
// 		});
//
// 	await db.sql.begin(async (sql) => {
// 		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
// 		const bet = await getBet(sql, betId);
// 		const { optionId, unmatchedQuantity, type, pricePerQuantity } = bet;
// 		const event = await getEvent(sql, eventId);
// 		//Matching still works event if is frozen. But it will stop matching when event status is changed completed
// 		if (event.status === "completed") {
// 			await removeBetFromQueue(sql, betId);
// 			return;
// 		}
// 		const { selectedOption, otherOption } = await validateOption(eventId, optionId);
//
// 		const unmatchedOrders = bet.userId
// 			? await getUnmatchedOrders(sql, event, type, pricePerQuantity, unmatchedQuantity, selectedOption.id, otherOption.id)
// 			: await getUnmatchedOrdersForAdmin(sql, event, pricePerQuantity, unmatchedQuantity, selectedOption.id);
// 		let remainingQuantity = unmatchedQuantity;
//
// 		for (const order of unmatchedOrders) {
// 			if (remainingQuantity === 0) break;
//
// 			const matchedQuantity = remainingQuantity < order.unmatchedQuantity ? remainingQuantity : order.unmatchedQuantity;
// 			remainingQuantity -= matchedQuantity;
//
// 			insertMatchedBetSqlPayload.push({
// 				betId: betId,
// 				matchedBetId: order.id,
// 				quantity: matchedQuantity,
// 				createdAt: new Date()
// 			});
//
// 			const unmatchedQuantity = order.unmatchedQuantity - matchedQuantity;
//
// 			if (order.type === "sell" && unmatchedQuantity === 0 && order.userId) {
// 				const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, order);
//
// 				addUpdateBetSqlPayload(order.id, unmatchedQuantity, profit, platformCommission);
// 				insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
// 			} else {
// 				addUpdateBetSqlPayload(order.id, unmatchedQuantity);
// 			}
// 		}
//
// 		if (remainingQuantity === 0 && bet.type === "sell" && bet.userId) {
// 			const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, bet);
//
// 			addUpdateBetSqlPayload(bet.id, remainingQuantity, profit, platformCommission);
// 			insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
// 		} else if (unmatchedQuantity !== remainingQuantity) {
// 			addUpdateBetSqlPayload(bet.id, remainingQuantity);
// 		}
//
// 		if (updateBetSqlPayload.length) {
// 			const payload = updateBetSqlPayload.map(({ id, unmatchedQuantity, profit, platformCommission, updatedAt }) => [id, unmatchedQuantity, profit, platformCommission, updatedAt]);
//
// 			//noinspection SqlResolve
// 			updateBetSqlPayload.length &&
// 				(await sql`
//           UPDATE "event".bet
//           SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
//               profit              = (update_data.profit)::decimal,
//               platform_commission = (update_data.platform_commission)::decimal,
//               updated_at          = update_data.updated_at
//           FROM (VALUES ${
// 						//@ts-ignore
// 						sql(payload)
// 					}) AS update_data (id, unmatched_quantity, profit, platform_commission, updated_at)
//           WHERE "event".bet.id = update_data.id
// 			`);
// 		}
//
// 		insertMatchedBetSqlPayload.length && (await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`);
// 		insertSellPayoutTxSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(insertSellPayoutTxSqlPayload)}`);
//
// 		await removeBetFromQueue(sql, betId);
// 	});
// };
//
// let runMatchQueueRunning = false;
// const runMatchQueue = async () => {
// 	try {
// 		if (runMatchQueueRunning) return;
// 		runMatchQueueRunning = true;
//
// 		const bets = (await db.sql`
//         SELECT *
//         FROM "event".bet_queue
//         ORDER BY created_at
// 		`) as [
// 			{
// 				betId: string;
// 				eventId: string;
// 			}
// 		];
//
// 		//@ts-ignore Not implemented in the stable typescript version yet
// 		const betsByEvents = Object.groupBy(bets, ({ eventId }) => eventId) as {
// 			[eventId: string]: {
// 				betId: string;
// 				eventId: string;
// 			}[];
// 		};
//
// 		await Promise.all(
// 			Object.keys(betsByEvents).map(async (event) => {
// 				for (const bet of betsByEvents[event]) {
// 					await matchOrder(bet.betId, bet.eventId);
// 				}
// 			})
// 		);
//
// 		runMatchQueueRunning = false;
// 	} catch (error) {
// 		console.error("Error running match queue", error);
// 		runMatchQueueRunning = false;
// 	}
// };
//
// setInterval(runMatchQueue, 5 * 1000);
//
// //Not using NOT IN BETWEEN because it's not inclusive
// const getLiquidityMatchableBets = async () =>
// 	z.array(Bet).parse(
// 		await db.sql`
//         SELECT bet.*
//         FROM "event".bet
//                  JOIN "event".event ON bet.event_id = event.id
//         WHERE event.status = 'live'
//           AND event.frozen = false
//           AND bet.user_id IS NOT NULL
//           AND bet.unmatched_quantity > 0
//           AND bet.updated_at < NOW() - INTERVAL '20 seconds'
//           AND ((bet.type = 'sell' AND bet.price_per_quantity <= event.platform_liquidity_left) OR
//                (bet.type = 'buy' AND event.win_price - bet.price_per_quantity <= event.platform_liquidity_left))
//           AND ((event.liquidity_in_between = false AND
//                 (bet.price_per_quantity <= event.win_price * event.min_liquidity_percentage / 100 OR
//                  bet.price_per_quantity >= event.win_price * event.max_liquidity_percentage / 100))
//             OR (event.liquidity_in_between = true AND
//                 bet.price_per_quantity BETWEEN event.win_price * event.min_liquidity_percentage / 100 AND event.win_price * event.max_liquidity_percentage / 100))
//         ORDER BY bet.price_per_quantity * bet.quantity DESC, bet.created_at`
// 	);
//
// const placeCounterLiquidityBet = async (sql: TransactionSql, bet: Bet, event: Event, selectedOption: number, otherOption: number, quantity: number) => {
// 	let counterBuyBet: Bet;
// 	const unmatchedQuantity = bet.unmatchedQuantity - quantity;
//
// 	if (bet.type === "sell") {
// 		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, selectedOption, bet.pricePerQuantity, 0, quantity, "buy", quantity, null, null, 0);
//
// 		if (unmatchedQuantity === 0) {
// 			const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, bet);
//
// 			await sql`INSERT INTO "wallet".transaction ${sql(payoutTxSqlPayload)}`;
//
// 			bet = {
// 				...bet,
// 				profit,
// 				platformCommission,
// 				unmatchedQuantity
// 			};
// 		}
// 	} else {
// 		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, otherOption, event.winPrice - bet.pricePerQuantity, 0, quantity, "buy", quantity, null, null, 0);
// 	}
//
// 	const insertMatchedBetSqlPayload = {
// 		betId: counterBuyBet.id,
// 		matchedBetId: bet.id,
// 		quantity,
// 		createdAt: new Date()
// 	};
//
// 	const updateBetSqlPayload = {
// 		profit: bet.profit,
// 		platformCommission: bet.platformCommission,
// 		unmatchedQuantity,
// 		updated_at: new Date()
// 	};
// 	await sql`INSERT INTO "event".bet ${sql(counterBuyBet)}`;
// 	await sql`UPDATE "event".bet
//             SET ${sql(updateBetSqlPayload)}
//             WHERE id = ${bet.id}`;
//
// 	await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`;
// 	await sql`UPDATE "event".event
//             SET platform_liquidity_left = platform_liquidity_left - ${counterBuyBet.pricePerQuantity * quantity},
//                 updated_at              = ${new Date()}
//             WHERE id = ${event.id}`;
//
// 	const counterSellBet = generateInsertBetSqlPayload(
// 		null,
// 		bet.eventId,
// 		counterBuyBet.optionId,
// 		counterBuyBet.pricePerQuantity,
// 		0,
// 		quantity,
// 		"sell",
// 		null,
// 		counterBuyBet.id,
// 		counterBuyBet.buyBetPricePerQuantity
// 	);
//
// 	const res = Bet.parse((await sql`INSERT INTO "event".bet ${sql(counterSellBet)} RETURNING *`)[0]);
// 	await addToBetQueue(sql, res);
// };
//
// const matchWithLiquidityEngine = async (bet: Bet) => {
// 	const { selectedOption, otherOption } = await validateOption(bet.eventId, bet.optionId);
//
// 	await db.sql.begin(async (sql) => {
// 		await sql`SELECT pg_advisory_xact_lock(hashtext(${bet.eventId}))`;
// 		const event = await getEvent(sql, bet.eventId);
// 		//Matching still works event if is frozen. But it will stop matching when event status is changed completed
// 		if (event.status === "completed") return;
//
// 		//Fetch bet again to check whether any other bet has already matched with it
// 		bet = await getBet(sql, bet.id);
//
// 		const pricePerQuantity = bet.type === "sell" ? bet.pricePerQuantity : event.winPrice - bet.pricePerQuantity;
// 		if (pricePerQuantity > event.platformLiquidityLeft) return;
// 		const liquidityMatchableQuantity = Math.floor(event.platformLiquidityLeft / pricePerQuantity);
//
// 		await placeCounterLiquidityBet(sql, bet, event, selectedOption.id, otherOption.id, liquidityMatchableQuantity > bet.unmatchedQuantity ? bet.unmatchedQuantity : liquidityMatchableQuantity);
// 	});
// };
//
// let liquidityEngineRunning = false;
// const liquidityEngine = async () => {
// 	try {
// 		if (liquidityEngineRunning) return;
// 		liquidityEngineRunning = true;
// 		const bets = await getLiquidityMatchableBets();
//
// 		for (const bet of bets) {
// 			await matchWithLiquidityEngine(bet);
// 		}
//
// 		liquidityEngineRunning = false;
// 	} catch (e) {
// 		console.error("Error running liquidityEngine", e);
// 		liquidityEngineRunning = false;
// 	}
// };
//
// setInterval(liquidityEngine, 20 * 1000);
//
// const cancelBets = async (sql: TransactionSql, event: Event, bets: Bet[]) => {
// 	if (!bets.length) return;
//
// 	const txSqlPayload: Transaction[] = [];
//
// 	//[id, soldQuantityReturn, rewardAmountUsed, updatedAt]
// 	const updateBuyBetSqlPayload: [string, number, number, Date][] = [];
//
// 	// [id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt]
// 	const updateBetSqlPayload: [string, number, number, number, number | null, number | null, Date][] = [];
//
// 	for (const bet of bets) {
// 		const { txSqlPayload: _txSqlPayload, updateBuyBetSqlPayload: _updateBuyBetSqlPayload, updateBetSqlPayload: _updateBetSqlPayload } = getCancelBetSqlPayload(bet, event, bet.unmatchedQuantity);
//
// 		_txSqlPayload && txSqlPayload.push(_txSqlPayload);
//
// 		if (_updateBuyBetSqlPayload) {
// 			const { id, soldQuantityReturn, rewardAmountReturn, updatedAt } = _updateBuyBetSqlPayload;
// 			updateBuyBetSqlPayload.push([id, soldQuantityReturn, rewardAmountReturn, updatedAt]);
// 		}
//
// 		const { id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt } = _updateBetSqlPayload;
// 		updateBetSqlPayload.push([id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt]);
// 	}
//
// 	txSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);
//
// 	//noinspection SqlResolve
// 	updateBuyBetSqlPayload.length &&
// 		(await sql`
//       UPDATE "event".bet
//       SET sold_quantity      = sold_quantity - (update_data.sold_quantity_return)::int,
//           reward_amount_used = reward_amount_used + (update_data.reward_amount_return)::decimal,
//           updated_at         = update_data.updated_at
//       FROM (VALUES ${
// 				//@ts-ignore
// 				sql(updateBuyBetSqlPayload)
// 			}) AS update_data (id, sold_quantity_return, reward_amount_return, updated_at)
//       WHERE "event".bet.id = update_data.id
// 	`);
//
// 	//noinspection SqlResolve
// 	await sql`UPDATE "event".bet
//             SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
//                 quantity            = (update_data.quantity)::int,
//                 reward_amount_used  = (update_data.reward_amount_used)::decimal,
//                 profit              = (update_data.profit)::decimal,
//                 platform_commission = (update_data.platform_commission)::decimal,
//                 updated_at          = update_data.updated_at
//             FROM (VALUES ${
// 							//@ts-ignore
// 							sql(updateBetSqlPayload)
// 						}) AS update_data (id, quantity, unmatched_quantity, reward_amount_used, profit, platform_commission,
//                                updated_at)
//             WHERE "event".bet.id = update_data.id`;
// };
//
// const cancelAllRemainingBets = async (sql: TransactionSql, event: Event) => {
// 	const sellBets = z.array(Bet).parse(
// 		await db.sql`
//         SELECT *
//         FROM "event".bet
//         WHERE event_id = ${event.id}
//           AND type = 'sell'
//           AND unmatched_quantity > 0
// 		`
// 	);
//
// 	await cancelBets(sql, event, sellBets);
//
// 	const buyBets = z.array(Bet).parse(
// 		await db.sql`
//         SELECT *
//         FROM "event".bet
//         WHERE event_id = ${event.id}
//           AND type = 'buy'
//           AND unmatched_quantity > 0
// 		`
// 	);
//
// 	await cancelBets(sql, event, buyBets);
// };
//
// const getBetWinningPayoutTxSqlPayload = (event: Event, bet: Bet) => {
// 	//Only buy bets will win an event. So soldQuantity will always be a number because it's a buy bet. So, casting it as number
// 	const quantity = bet.quantity - (bet.soldQuantity as number);
//
// 	const { profit, platformCommission, amount: _amount } = getProfitAndCommission(quantity, bet.pricePerQuantity, event.winPrice, event.platformFeesPercentage);
//
// 	const amount = _amount - bet.rewardAmountUsed;
//
// 	console.log("profit", profit, "platformCommission", platformCommission, "amount", amount, "quantity", quantity);
//
// 	const updateBetPayload = {
// 		id: bet.id,
// 		profit,
// 		platformCommission,
// 		updatedAt: new Date()
// 	};
//
// 	const txPayload = generateTxSqlPayload(bet.userId as string, "bet_win", amount, bet.rewardAmountUsed, event.token, event.chain, null, "completed", bet.id, quantity);
//
// 	console.log(txPayload);
//
// 	return {
// 		updateBetPayload,
// 		txPayload
// 	};
// };
//
// const resolveEvent = async (eventId: string) => {
// 	await db.sql.begin(async (sql) => {
// 		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
// 		const event = await getEvent(sql, eventId);
//
// 		await cancelAllRemainingBets(sql, event);
//
// 		if (!event.optionWon || event.resolved) return;
//
// 		await sql`UPDATE "event".bet
//               SET profit              = -(bet.price_per_quantity * bet.quantity),
//                   platform_commission = 0
//               WHERE type = 'buy'
//                 AND option_id <> ${event.optionWon}
//                 AND user_id IS NOT NULL`;
//
// 		const bets = z.array(Bet).parse(
// 			await db.sql`
//           SELECT *
//           FROM "event".bet
//           WHERE event_id = ${eventId}
//             AND type = 'buy'
//             AND option_id = ${event.optionWon}
//             AND quantity > 0
//             AND user_id IS NOT NULL
// 			`
// 		);
//
// 		if (!bets.length) return;
//
// 		const txSqlPayload: Transaction[] = [];
//
// 		//[id, profit, platformCommission, updatedAt]
// 		const updateBetSqlPayload: [string, number, number, Date][] = [];
//
// 		for (const bet of bets) {
// 			const { updateBetPayload, txPayload } = getBetWinningPayoutTxSqlPayload(event, bet);
// 			txSqlPayload.push(txPayload);
// 			const { id, profit, platformCommission, updatedAt } = updateBetPayload;
// 			updateBetSqlPayload.push([id, profit, platformCommission, updatedAt]);
// 		}
//
// 		//noinspection SqlResolve
// 		updateBetSqlPayload.length &&
// 			(await sql`
//         UPDATE "event".bet
//         SET profit              = (update_data.profit)::decimal,
//             platform_commission = (update_data.platform_commission)::decimal,
//             updated_at          = update_data.updated_at
//         FROM (VALUES ${
// 					//@ts-ignore
// 					sql(updateBetSqlPayload)
// 				}) AS update_data (id, profit, platform_commission, updated_at)
//         WHERE "event".bet.id = update_data.id
// 		`);
//
// 		txSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);
//
// 		await sql`UPDATE "event".event
//               SET resolved    = true,
//                   resolved_at = NOW()
//               WHERE id = ${eventId}`;
// 	});
// };
//
// let initEventPayoutRunning = false;
// const initEventPayout = async () => {
// 	try {
// 		if (initEventPayoutRunning) return;
//
// 		const events = z.array(Event).parse(
// 			await db.sql`
//           SELECT *
//           FROM "event".event
//           WHERE status = 'completed'
//             AND resolved = false
// 			`
// 		);
//
// 		for (const event of events) {
// 			await resolveEvent(event.id);
// 		}
//
// 		initEventPayoutRunning = true;
//
// 		initEventPayoutRunning = false;
// 	} catch (e) {
// 		console.error("Error updating event status", e);
// 		initEventPayoutRunning = false;
// 	}
// };
//
// setInterval(initEventPayout, 5 * 1000);
//
export { Bet, BetType, placeBet, getBets };
