import { createId } from "@paralleldrive/cuid2";
import { getMessaging } from "firebase-admin/messaging";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import { db } from "../config";
import { BetSchema } from "../schema";
import { ErrorUtil } from "../util";
import { Event, getEvent, getEventOptions, Option } from "./event.ts";
import { EventService, UserService, WalletService } from "./index.ts";
import { Chain, generateTxSqlPayload, getUserTokenBalance, Token, type Transaction } from "./wallet.ts";

const BetType = z.enum(["buy", "sell"]);
type BetType = z.infer<typeof BetType>;

const BetStatus = z.enum(["live", "closed"]);
type BetStatus = z.infer<typeof BetStatus>;

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
 *  Retrieves bets based on the provided parameters.
 *
 * @param {string | null} userId - The ID of the user whose bets are to be retrieved. If null, bets for all users are retrieved.
 * @param {BetSchema.GetBetsPayload} payload - An object containing the parameters for retrieving the bets.
 * @param {number} page - The page number for pagination.
 * @param {number} limit - The number of bets to retrieve per page.
 *
 * @returns {Promise<BetSchema.BetPaginatedResponse>} Returns a promise that resolves to an object containing the retrieved bets, the total number of bets, the current page, and the limit.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if neither eventId nor userId is provided.
 */
const getBets = async (userId: string | null = null, payload: BetSchema.GetBetsPayload, page: number, limit: number): Promise<BetSchema.BetPaginatedResponse> => {
	const { eventId, type, status, filter, token, chain } = payload;
	if (!eventId && !userId) throw new ErrorUtil.HttpException(400, "EventId or UserId is required.");

	const bets = db.sql`SELECT b.*
                      FROM "event".bet b ${token || chain ? db.sql`JOIN "event".event e ON b.event_id = e.id` : db.sql``}
                      WHERE b.quantity
                          > 0 ${eventId ? db.sql`AND b.event_id = ${eventId}` : db.sql``} ${userId ? db.sql`AND b.user_id = ${userId}` : db.sql``} ${type ? db.sql`AND b.type = ${type}` : db.sql``} ${status === "live" ? db.sql`AND b.profit IS NULL` : status === "closed" ? db.sql`AND b.profit IS NOT NULL` : db.sql``} ${filter === "day" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 day'` : filter === "week" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 week'` : filter === "month" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 month'` : filter === "year" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 year'` : db.sql``} ${token ? db.sql`AND e.token = ${token}` : db.sql``} ${chain ? db.sql`AND e.chain = ${chain}` : db.sql``}
                      ORDER BY created_at DESC
                      LIMIT ${limit} OFFSET ${page * limit}`;
	const total = db.sql`SELECT COUNT(*)
                       FROM "event".bet b ${token || chain ? db.sql`JOIN "event".event e ON b.event_id = e.id` : db.sql``}
                       WHERE b.quantity
                           > 0 ${eventId ? db.sql`AND b.event_id = ${eventId}` : db.sql``} ${userId ? db.sql`AND b.user_id = ${userId}` : db.sql``} ${type ? db.sql`AND b.type = ${type}` : db.sql``} ${status === "live" ? db.sql`AND b.profit IS NULL` : status === "closed" ? db.sql`AND b.profit IS NOT NULL` : db.sql``} ${filter === "day" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 day'` : filter === "week" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 week'` : filter === "month" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 month'` : filter === "year" ? db.sql`AND b.created_at > NOW() - INTERVAL '1 year'` : db.sql``} ${token ? db.sql`AND e.token = ${token}` : db.sql``} ${chain ? db.sql`AND e.chain = ${chain}` : db.sql``}` as Promise<
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
 * This function calculates the invested and current amount of a user's bets based on the provided filter and status.
 *
 * @async
 * @function getInvestedAndCurrentAmount
 * @param {string} userId - The ID of the user whose invested and current amount is to be calculated.
 * @param {UserService.TimeFilter} timeFilter - The time filter for retrieving the bets.
 * @param {BetStatus} status - The status of the bets to be included in the calculation.
 * @param {Token} [token] - The token type of the bets to be included in the calculation. Optional.
 * @param {Chain} [chain] - The chain type of the bets to be included in the calculation. Optional.
 * @param eventId - The ID of the event to filter the bets. Optional.
 * @returns {Promise<{investedAmount: number, currentAmount: number}>} - A promise that resolves to an object containing the invested amount and current value.
 *
 * The function performs the following steps:
 * 1. Begins a SQL transaction.
 * 2. Initializes variables for the invested amount and current value.
 * 3. If the status is "live", it calculates the invested amount and current value for live bets.
 *    - It retrieves the sum of the quantity minus the sold quantity multiplied by the price per quantity for all live buy bets of the user.
 *    - It adds the retrieved sum to the invested amount.
 *    - It retrieves the sum of the quantity multiplied by the buy bet price per quantity for all live sell bets of the user.
 *    - It adds the retrieved sum to the invested amount and current value.
 *    - It retrieves the sum of the quantity minus the sold quantity multiplied by the option price for all live buy bets of the user.
 *    - It adds the retrieved sum to the current value.
 * 4. If the status is not "live", it calculates the invested amount and current value for closed bets.
 *    - It retrieves the sum of the quantity multiplied by the price per quantity for all closed buy bets of the user.
 *    - It adds the retrieved sum to the invested amount.
 *    - It retrieves the sum of the profit for all closed bets of the user.
 *    - It adds the retrieved sum to the current value.
 * 5. Returns an object containing the invested amount and current value.
 */
const getInvestedAndCurrentAmount = async (
	userId: string,
	timeFilter: UserService.TimeFilter,
	status: BetStatus,
	token?: Token | null,
	chain?: Chain | null,
	eventId?: string | null
): Promise<{
	investedAmount: number;
	currentAmount: number;
}> => {
	return await db.sql.begin(async (sql) => {
		let investedAmount: number = 0;
		let currentAmount: number = 0;

		if (status === "live") {
			const [res1] = (await sql`SELECT SUM((b.quantity - b.sold_quantity) * b.price_per_quantity) AS invested_amount
                                FROM "event".bet b
                                    ${token || chain ? sql`JOIN "event".event e ON b.event_id = e.id` : sql``}
                                WHERE b.user_id = ${userId}
                                  AND b.type = 'buy'
                                  AND b.profit IS NULL ${timeFilter === "day" ? sql`AND b.created_at > NOW() - INTERVAL '1 day'` : timeFilter === "week" ? sql`AND b.created_at > NOW() - INTERVAL '1 week'` : timeFilter === "month" ? sql`AND b.created_at > NOW() - INTERVAL '1 month'` : timeFilter === "year" ? sql`AND b.created_at > NOW() - INTERVAL '1 year'` : sql``} ${token ? sql`AND e.token = ${token}` : sql``} ${chain ? sql`AND e.chain = ${chain}` : sql``} ${eventId ? sql`AND b.event_id = ${eventId}` : sql``}
			`) as [
				{
					investedAmount: string | null;
				}
			];

			investedAmount += Number(res1.investedAmount);

			const [res2] = (await sql`SELECT SUM((b.quantity) * b.buy_bet_price_per_quantity) AS invested_amount
                                FROM "event".bet b
                                    ${token || chain ? sql`JOIN "event".event e ON b.event_id = e.id` : sql``}
                                WHERE b.user_id = ${userId}
                                  AND b.type = 'sell'
                                  AND b.profit IS NULL ${timeFilter === "day" ? sql`AND b.created_at > NOW() - INTERVAL '1 day'` : timeFilter === "week" ? sql`AND b.created_at > NOW() - INTERVAL '1 week'` : timeFilter === "month" ? sql`AND b.created_at > NOW() - INTERVAL '1 month'` : timeFilter === "year" ? sql`AND b.created_at > NOW() - INTERVAL '1 year'` : sql``} ${token ? sql`AND e.token = ${token}` : sql``} ${chain ? sql`AND e.chain = ${chain}` : sql``} ${eventId ? sql`AND b.event_id = ${eventId}` : sql``}
			`) as [
				{
					investedAmount: string | null;
				}
			];

			{
				investedAmount += Number(res2.investedAmount);
				currentAmount += Number(res2.investedAmount);
			}

			//noinspection SqlResolve
			const [res3] = (await sql`SELECT SUM((b.quantity - b.sold_quantity) * o.price) AS current_amount
                                FROM "event".bet b ${token || chain ? sql`JOIN "event".event e ON b.event_id = e.id` : sql``}
                                         JOIN "event".option o
                                ON b.option_id = o.id
                                WHERE b.user_id = ${userId}
                                  AND b.type = 'buy'
                                  AND b.profit IS NULL ${timeFilter === "day" ? sql`AND b.created_at > NOW() - INTERVAL '1 day'` : timeFilter === "week" ? sql`AND b.created_at > NOW() - INTERVAL '1 week'` : timeFilter === "month" ? sql`AND b.created_at > NOW() - INTERVAL '1 month'` : timeFilter === "year" ? sql`AND b.created_at > NOW() - INTERVAL '1 year'` : sql``} ${token ? sql`AND e.token = ${token}` : sql``} ${chain ? sql`AND e.chain = ${chain}` : sql``}`) as [
				{
					currentAmount: string | null;
				}
			];

			currentAmount += Number(res3.currentAmount);
		} else {
			const [res1] = (await sql`SELECT SUM(b.quantity * b.price_per_quantity) AS invested_amount
                                FROM "event".bet b
                                    ${token || chain ? sql`JOIN "event".event e ON b.event_id = e.id` : sql``}
                                WHERE b.user_id = ${userId}
                                  AND b.type = 'buy'
                                  AND b.profit IS NOT NULL ${timeFilter === "day" ? sql`AND b.created_at > NOW() - INTERVAL '1 day'` : timeFilter === "week" ? sql`AND b.created_at > NOW() - INTERVAL '1 week'` : timeFilter === "month" ? sql`AND b.created_at > NOW() - INTERVAL '1 month'` : timeFilter === "year" ? sql`AND b.created_at > NOW() - INTERVAL '1 year'` : sql``} ${token ? sql`AND e.token = ${token}` : sql``} ${chain ? sql`AND e.chain = ${chain}` : sql``}`) as [
				{
					investedAmount: string | null;
				}
			];

			investedAmount += Number(res1.investedAmount);
			currentAmount += Number(res1.investedAmount);

			const [res2] = (await sql`SELECT SUM(profit) AS current_amount
                                FROM "event".bet b ${token || chain ? sql`JOIN "event".event e ON b.event_id = e.id` : sql``}
                                WHERE user_id = ${userId}
                                  AND profit IS NOT NULL ${timeFilter === "day" ? sql`AND b.created_at > NOW() - INTERVAL '1 day'` : timeFilter === "week" ? sql`AND b.created_at > NOW() - INTERVAL '1 week'` : timeFilter === "month" ? sql`AND b.created_at > NOW() - INTERVAL '1 month'` : timeFilter === "year" ? sql`AND b.created_at > NOW() - INTERVAL '1 year'` : sql``} ${token ? sql`AND e.token = ${token}` : sql``} ${chain ? sql`AND e.chain = ${chain}` : sql``}`) as [
				{
					currentAmount: string | null;
				}
			];
			currentAmount += Number(res2.currentAmount);
		}

		return {
			investedAmount,
			currentAmount
		};
	});
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
            SET sold_quantity      = sold_quantity + ${quantity},
                reward_amount_used = reward_amount_used - ${rewardAmountUsed},
                updated_at         = ${new Date()}
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
 * @async
 * @function placeBet
 * @param {string} userId - The ID of the user placing the bet.
 * @param {BetSchema.PlaceBetPayload} payload - An object containing the details of the bet.
 * @returns {Promise<Bet>} Returns a promise that resolves to a Bet object.
 *
 * The function performs the following steps:
 * 1. Validates the selected option for the bet.
 * 2. Begins a SQL transaction.
 * 3. Checks if the user is locked. If so, it throws an HttpException.
 * 4. Validates the event for the bet.
 * 5. If the bet is a buy bet, it validates the total price of the bet against the user's balance and generates a buy bet payload and a transaction payload.
 * 6. If the bet is a sell bet, it validates the buy bet for the sell bet and generates a sell bet payload.
 * 7. Inserts the bet into the database and adds it to the bet queue.
 * 8. If the bet is a buy bet, it inserts the transaction into the database.
 * 9. Gives the user points equivalent to 5% of the bet amount.
 * 10. Gives the event referrer 5 points if the referredBy field is provided and valid.
 * 11. If it is user's first bet, and they were referred by someone to sign up to the platform, gives the referrer 25 points.
 * 12. Inserts a notification for the bet into the database and sends the notification to the user. Notification is not sent for points because that would only get credited to the user's account after 7 days.
 * 13. Returns the bet.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the user is locked, the bet is a sell bet without a buy bet id, or any validation fails.
 */
const placeBet = async (userId: string, payload: BetSchema.PlaceBetPayload): Promise<Bet> => {
	const { price: _price, quantity, eventId, type, buyBetId, optionId, referredBy } = payload;

	if (userId === referredBy) throw new ErrorUtil.HttpException(400, "User cannot refer themselves.");

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

		const token = WalletService.TokenCombination.find((token) => token.token === event.token && token.chain === event.chain) as {
			address: string;
			token: Token;
		};
		const points = Math.ceil(0.05 * totalPrice * (await WalletService.getTokenConversionRate(token.address, token.token)));

		const pointSqlPayload = [];
		const notificationSqlPayload = [];

		pointSqlPayload.push(
			UserService.getPointSqlPayload(userId, "bet", points, {
				betId: bet.id,
				completed: false
			})
		);

		if (referredBy) {
			pointSqlPayload.push(
				UserService.getPointSqlPayload(referredBy, "bet_invite", 5, {
					betId: bet.id,
					completed: false
				})
			);
		}

		const [referral] = (await sql`SELECT rc.user_id, r.id
                                  FROM "user".referral r
                                           JOIN "user".referral_code rc ON r.referral_code_id = rc.id
                                  WHERE r.user_id = ${userId}
                                    AND r.completed = false`) as [{ userId: string | null; id: string }] | [];

		if (referral?.userId) {
			pointSqlPayload.push(
				UserService.getPointSqlPayload(referral.userId, "referral", 25, {
					betId: bet.id,
					referralId: referral.id,
					completed: true
				})
			);

			notificationSqlPayload.push(
				UserService.getNotificationSqlPayload(referral.userId, "point", {
					title: "Referral Bonus",
					message: `You have received 25 points for referring a user who just placed their first bet.`
				})
			);

			await sql`UPDATE "user".referral
                SET completed = true
                WHERE id = ${referral.id}`;
		}

		notificationSqlPayload.push(
			UserService.getNotificationSqlPayload(userId, "bet", {
				title: "Order Placed",
				message: `Successfully placed a ${type} order of ${quantity > 1 ? `${quantity} quantities` : "1 quantity"} on ${selectedOption.name} option for the event "${event.name}".`,
				betId: bet.id
			})
		);

		await sql`INSERT INTO "user".point ${sql(pointSqlPayload)}`;
		await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`;

		Promise.all(
			notificationSqlPayload.map((payload) => {
				return getMessaging().send({
					notification: {
						title: payload.title,
						body: payload.message
					},
					topic: userId
				});
			})
		).catch((error) => {
			console.error("Error sending notification in place bet function", error);
		});

		return bet;
	});
};

/**
 * Calculates the profit, commission and amount for a transaction.
 *
 * @param {number} quantity - The quantity of the item being transacted.
 * @param {number} initialPrice - The initial price per item.
 * @param {number} finalPrice - The final price per item.
 * @param {number} platformFees - The platform fees as a percentage.
 *
 * @returns {Object} An object containing the calculated amount, profit and platform commission.
 * The amount is the total final price minus the platform commission.
 * The profit is the earned amount minus the commission, or the earned amount if it's less than zero.
 * The platform commission is zero if the profit equals the earned amount, otherwise it's the calculated commission.
 */
const getProfitAndCommission = (
	quantity: number,
	initialPrice: number,
	finalPrice: number,
	platformFees: number
): {
	amount: number;
	profit: number;
	platformCommission: number;
} => {
	const initialPriceTotal = quantity * initialPrice;
	const finalPriceTotal = quantity * finalPrice;

	const earned = finalPriceTotal - initialPriceTotal;
	const commission = earned > 0 ? (finalPriceTotal * platformFees) / 100 : 0;
	const profit = earned - commission < 0 ? earned : earned - commission;
	const platformCommission = profit === earned ? 0 : commission;
	const amount = finalPriceTotal - platformCommission;

	return { amount, profit, platformCommission };
};

/**
 * Generates the payout transaction payload for a sell bet.
 *
 * @param {Event} event - The event object related to the sell bet.
 * @param {Bet} sellBet - The sell bet object for which the payout is being calculated.
 *
 * @returns {Object} An object containing the payout transaction payload, the profit and the platform commission.
 * The payout transaction payload is an object containing the details of the payout transaction.
 * The profit is the earned amount minus the commission, or the earned amount if it's less than zero.
 * The platform commission is zero if the profit equals the earned amount, otherwise it's the calculated commission.
 */
const getSellPayoutTxSqlPayload = (
	event: Event,
	sellBet: Bet
): {
	payoutTxSqlPayload: Transaction;
	profit: number;
	platformCommission: number;
} => {
	//sellBet will always have butBetPricePerQuantity as number because it's a sell bet. So, casting it as number
	const { amount: _amount, profit, platformCommission } = getProfitAndCommission(sellBet.quantity, sellBet.buyBetPricePerQuantity as number, sellBet.pricePerQuantity, event.platformFeesPercentage);
	const amount = _amount - sellBet.rewardAmountUsed;

	const payoutTxSqlPayload = generateTxSqlPayload(sellBet.userId as string, "bet", amount, sellBet.rewardAmountUsed, event.token, event.chain, null, "completed", sellBet.id, sellBet.quantity);

	return { payoutTxSqlPayload, profit, platformCommission };
};

/**
 * Generates the SQL payload for cancelling a bet.
 *
 * @param {Bet} bet - The bet object to be cancelled.
 * @param {Event} event - The event object related to the bet.
 * @param {number} quantity - The quantity of the bet to be cancelled.
 *
 * @param option - The option the bet is placed on. Used for sending notification to the user.
 * @param eventResolution - A boolean indicating whether the event is being resolved. Default is false.
 * @returns {Object} An object containing the SQL payloads for updating the bet, the transaction, the buy bet and the notification.
 * The updateBetSqlPayload is an object containing the details for updating the bet in the database.
 * The txSqlPayload is an object containing the details for updating the transaction in the database.
 * The updateBuyBetSqlPayload is an object containing the details for updating the buy bet in the database.
 * The notificationSqlPayload is an object containing the details for inserting a notification into the database.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the unmatched quantity is zero and the quantity is not null.
 */
const getCancelBetSqlPayload = (
	bet: Bet,
	event: Event,
	quantity: number,
	option: Option,
	eventResolution: boolean = false
): {
	updateBetSqlPayload: {
		id: string;
		unmatchedQuantity: number;
		rewardAmountUsed: number;
		quantity: number;
		profit: number | null;
		platformCommission: number | null;
		updatedAt: Date;
	};
	txSqlPayload: Transaction | null;
	updateBuyBetSqlPayload: {
		id: string;
		soldQuantityReturn: number;
		rewardAmountReturn: number;
		updatedAt: Date;
	} | null;
	notificationSqlPayload: UserService.Notification[];
} => {
	const totalCancelAmount = bet.pricePerQuantity * quantity;
	const totalAmount = bet.pricePerQuantity * bet.quantity - bet.rewardAmountUsed;

	//Since reward amount have priority during placing the bet, we will be refunding the main balance first
	const rewardAmount = totalCancelAmount > totalAmount ? totalCancelAmount - totalAmount : 0;
	const amount = totalCancelAmount - rewardAmount;

	const updateBetSqlPayload = {
		id: bet.id,
		unmatchedQuantity: bet.unmatchedQuantity - quantity,
		rewardAmountUsed: bet.rewardAmountUsed - rewardAmount,
		quantity: bet.quantity - quantity,
		profit: null,
		platformCommission: null,
		updatedAt: new Date()
	};

	let updateBuyBetSqlPayload: {
		id: string;
		soldQuantityReturn: number;
		rewardAmountReturn: number;
		updatedAt: Date;
	} | null = null;

	let txSqlPayload: Transaction | null = null;
	const notificationSqlPayload: UserService.Notification[] = [];

	if (bet.userId) {
		const title = "Order Cancelled";
		const message = eventResolution
			? `${quantity} out of ${bet.quantity} ${
					bet.quantity > 1 ? "quantities" : "quantity"
				} of your ${bet.type} order on ${option.name} option for the event "${event.name}" has been cancelled due to event resolution.`
			: `Successfully cancelled ${quantity} out of ${bet.quantity > 1 ? `quantities` : "quantity"} of your ${bet.type} order on ${option.name} option for the event "${event.name}"`;

		notificationSqlPayload.push(
			UserService.getNotificationSqlPayload(bet.userId, "bet_cancel", {
				title,
				message,
				betId: bet.id
			})
		);
	}

	if (bet.type === "buy" && bet.userId) {
		txSqlPayload = generateTxSqlPayload(bet.userId, "bet_cancel", amount, rewardAmount, event.token, event.chain, null, "completed", bet.id, quantity);
	} else {
		updateBuyBetSqlPayload = {
			id: bet.buyBetId as string,
			soldQuantityReturn: quantity,
			rewardAmountReturn: rewardAmount,
			updatedAt: new Date()
		};

		const unmatchedQuantity = bet.unmatchedQuantity - quantity;
		if (bet.userId && unmatchedQuantity === 0) {
			const remainingQuantity = bet.quantity - quantity;

			if (remainingQuantity)
				notificationSqlPayload.push(
					UserService.getNotificationSqlPayload(bet.userId, "bet_exit", {
						title: "Order Completed",
						message: `Your sell order on ${option.name} option for ${remainingQuantity > 1 ? `${remainingQuantity} quantities` : "1 quantity"} has been completed for the event "${event.name}".`,
						betId: bet.id
					})
				);

			if (updateBetSqlPayload.quantity) {
				const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, {
					...bet,
					quantity: updateBetSqlPayload.quantity
				});

				txSqlPayload = payoutTxSqlPayload;

				return {
					updateBetSqlPayload: {
						...updateBetSqlPayload,
						profit,
						platformCommission
					},
					txSqlPayload,
					updateBuyBetSqlPayload,
					notificationSqlPayload
				};
			} else {
				return {
					updateBetSqlPayload: {
						...updateBetSqlPayload,
						profit: 0,
						platformCommission: 0
					},
					txSqlPayload,
					updateBuyBetSqlPayload,
					notificationSqlPayload
				};
			}
		}
	}

	return {
		updateBetSqlPayload,
		txSqlPayload,
		updateBuyBetSqlPayload,
		notificationSqlPayload
	};
};

/**
 * Checks if a bet is within the top 5 bets for a given event.
 * It returns bet instead of just boolean to avoid another query to get the bet details during cancellation of the bet. That's why the betId where clause is added in the inner query;
 *
 * @param {TransactionSql | Sql} sql - The SQL transaction object.
 * @param {string} eventId - The ID of the event.
 * @param {string} betId - The ID of the bet.
 * @param {boolean} [check=false] - Optional parameter. If true, the function returns a boolean indicating whether the bet is in the top 5. If false or not provided, the function throws an exception if the bet is in the top 5.
 *
 * @returns {Promise<Bet | Boolean>} Returns a promise that resolves to a Bet object if the bet is not in the top 5 and check is false or not provided. If check is true, it returns a boolean indicating whether the bet is in the top 5.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException with status 400 if the bet is in the top 5 and check is false or not provided.
 */
const isTop5Bet = async (sql: TransactionSql | Sql, eventId: string, betId: string, check?: boolean): Promise<Bet | Boolean> => {
	const [bet] = z.array(z.intersection(Bet, z.object({ rowNumber: z.coerce.number() }))).parse(
		await sql`
        SELECT *
        FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY price_per_quantity * quantity DESC, created_at) as row_number
              FROM "event".bet
              WHERE event_id = ${eventId}
                AND (unmatched_quantity > 0 OR id = ${betId}))
        WHERE id = ${betId}`
	);

	if (!bet) throw new ErrorUtil.HttpException(400, "Invalid bet id.");

	if (check) return false;

	// if (check) return bet.rowNumber <= 5 && bet.unmatchedQuantity > 0;

	// if (bet.rowNumber <= 5 && bet.unmatchedQuantity > 0) throw new ErrorUtil.HttpException(400, "Cannot cancel, bet is in priority queue.");
	return bet;
};

/**
 * Cancels a bet for a given user and event.
 *
 * @param {string} userId - The ID of the user cancelling the bet.
 * @param {string} eventId - The ID of the event related to the bet.
 * @param {string} betId - The ID of the bet to be cancelled.
 * @param {number} quantity - The quantity of the bet to be cancelled.
 *
 * @returns {Promise<Bet>} Returns a promise that resolves to a Bet object.
 * The Bet object is the result of the cancelled bet.
 *
 * @throws {ErrorUtil.HttpException} Throws an HttpException if user tries to place or cancel bets simultaneously.
 * @throws {ErrorUtil.HttpException} Throws an HttpException if the quantity to be cancelled is higher than the unmatched quantity of the bet.
 */
const cancelBet = async (userId: string, eventId: string, betId: string, quantity: number): Promise<Bet> => {
	return await db.sql.begin(async (sql) => {
		if (await checkUserLockStatus(sql, userId)) throw new ErrorUtil.HttpException(429, "Only one bet order is allowed at a time.");
		//Locking the event to prevent concurrent modifications to the bet from matching queue
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
		const event = await validateEvent(sql, eventId);
		const bet = (await isTop5Bet(sql, eventId, betId)) as Bet;

		if (quantity > bet.unmatchedQuantity) throw new ErrorUtil.HttpException(400, "Quantity is higher than unmatched quantity.");

		const {
			updateBetSqlPayload: _updateBetSqlPayload,
			txSqlPayload,
			updateBuyBetSqlPayload,
			notificationSqlPayload
		} = getCancelBetSqlPayload(bet, event, quantity, await EventService.getOption(bet.optionId));

		const { id: _, ...updateBetSqlPayload } = _updateBetSqlPayload;

		updateBuyBetSqlPayload &&
			(await sql`UPDATE "event".bet
               SET sold_quantity      = sold_quantity - ${updateBuyBetSqlPayload.soldQuantityReturn},
                   reward_amount_used = reward_amount_used + ${updateBuyBetSqlPayload.rewardAmountReturn},
                   updated_at         = ${updateBuyBetSqlPayload.updatedAt}
               WHERE id = ${updateBuyBetSqlPayload.id}`);

		txSqlPayload && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);

		await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`;

		Promise.all(
			notificationSqlPayload.map((payload) => {
				return getMessaging().send({
					notification: {
						title: payload.title,
						body: payload.message
					},
					topic: userId
				});
			})
		).catch((error) => {
			console.error("Error sending notification in cancel bet function", error);
		});

		return Bet.parse(
			(
				await sql`UPDATE "event".bet
                  SET ${sql(updateBetSqlPayload)}
                  WHERE id = ${bet.id}
                  RETURNING *`
			)[0]
		);
	});
};

/**
 * Retrieves unmatched orders for a given event and bet type.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Event} event - The event object related to the bet.
 * @param {BetType} type - The type of the bet (buy or sell).
 * @param {number} price - The price per quantity for the bet.
 * @param {number} quantity - The quantity of the bet.
 * @param {number} selectedOption - The ID of the selected option for the bet.
 * @param {number} otherOption - The ID of the other option for the bet.
 *
 * @returns {Promise<Array<Bet>>} Returns a promise that resolves to an array of Bet objects.
 * The Bet objects are the unmatched orders for the given event and bet type.
 * The orders are sorted by total price in descending order and creation date in ascending order.
 * The function uses a SQL query with a WITH clause to create a temporary table of unmatched orders.
 * It then selects from this table where the cumulative sum of the unmatched quantity is less than or equal to the bet quantity.
 * It also selects the first order where the cumulative sum is greater than the bet quantity.
 */
const getUnmatchedOrders = async (sql: TransactionSql, event: Event, type: BetType, price: number, quantity: number, selectedOption: number, otherOption: number): Promise<Array<Bet>> =>
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

/**
 * Retrieves unmatched orders for a given event for admin users.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Event} event - The event object related to the bet.
 * @param {number} price - The price per quantity for the bet.
 * @param {number} quantity - The quantity of the bet.
 * @param {number} selectedOption - The ID of the selected option for the bet.
 *
 * @returns {Promise<Array<Bet>>} Returns a promise that resolves to an array of Bet objects.
 * The Bet objects are the unmatched orders for the given event.
 * The orders are sorted by total price in descending order and creation date in ascending order.
 * The function uses a SQL query with a WITH clause to create a temporary table of unmatched orders.
 * It then selects from this table where the cumulative sum of the unmatched quantity is less than or equal to the bet quantity.
 * It also selects the first order where the cumulative sum is greater than the bet quantity.
 * This function is specifically for admin users and only retrieves orders where the user ID is not null (i.e. not platform bets).
 */
const getUnmatchedOrdersForAdmin = async (sql: TransactionSql, event: Event, price: number, quantity: number, selectedOption: number): Promise<Array<Bet>> =>
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

/**
 * Removes a bet from the bet queue in the database.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {string} betId - The ID of the bet to be removed from the queue.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the bet has been removed from the queue.
 */
const removeBetFromQueue = async (sql: TransactionSql, betId: string): Promise<void> => {
	await sql`DELETE
            FROM "event".bet_queue
            WHERE bet_id = ${betId}`;
};

/**
 * Matches a bet with other bets in the system.
 *
 * @param {string} betId - The ID of the bet to be matched.
 * @param {string} eventId - The ID of the event related to the bet.
 *
 * The function performs the following steps:
 * 1. Initializes empty arrays for storing SQL payloads for matched bets, sell payout transactions, and bet updates.
 * 2. Begins a SQL transaction and locks the event to prevent concurrent modifications.
 * 3. Retrieves the bet and event details from the database.
 * 4. Checks if the event status is "completed". If so, removes the bet from the queue and ends the function.
 * 5. Retrieves the selected and other options for the bet.
 * 6. Retrieves unmatched orders for the bet. If the bet is placed by a user, it retrieves all unmatched orders. If the bet is placed by the platform, it only retrieves unmatched buy orders for the selected option.
 * 7. Iterates over the unmatched orders. For each order, it calculates the matched quantity and updates the remaining quantity of the bet. It also generates SQL payloads for matched bets and sell payout transactions.
 * 8. If the remaining quantity of the bet is zero and the bet is a sell bet placed by a user, it generates a sell payout transaction.
 * 9. If the unmatched quantity of the bet has changed, it generates a SQL payload for updating the bet.
 * 10. Sends notifications for completed sell orders.
 * 11. Updates the bets in the database using the generated SQL payloads.
 * 12. Inserts the matched bets and sell payout transactions into the database.
 * 13. Removes the bet from the queue.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the bet has been matched.
 */
const matchOrder = async (betId: string, eventId: string): Promise<void> => {
	const insertMatchedBetSqlPayload: {
		betId: string;
		matchedBetId: string;
		quantity: number;
		createdAt: Date;
	}[] = [];

	const insertSellPayoutTxSqlPayload: Transaction[] = [];

	const updateBetSqlPayload: {
		id: string;
		unmatchedQuantity: number;
		profit: number | null;
		platformCommission: number | null;
		updatedAt: Date;
	}[] = [];

	const notificationSqlPayload: UserService.Notification[] = [];

	const addUpdateBetSqlPayload = (betId: string, unmatchedQuantity: number, profit: number | null = null, platformCommission: number | null = null) =>
		updateBetSqlPayload.push({
			id: betId,
			unmatchedQuantity,
			profit,
			platformCommission,
			updatedAt: new Date()
		});

	await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
		const bet = await getBet(sql, betId);
		const { optionId, unmatchedQuantity, type, pricePerQuantity } = bet;
		const event = await getEvent(sql, eventId);
		if (event.status === "completed" || bet.unmatchedQuantity === 0) {
			await removeBetFromQueue(sql, betId);
			return;
		}
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
				quantity: matchedQuantity,
				createdAt: new Date()
			});

			const unmatchedQuantity = order.unmatchedQuantity - matchedQuantity;

			if (order.type === "sell" && unmatchedQuantity === 0 && order.userId) {
				notificationSqlPayload.push(
					UserService.getNotificationSqlPayload(order.userId, "bet_exit", {
						title: "Order Completed",
						message: `Your sell order on ${selectedOption.name} option for ${remainingQuantity > 1 ? `${remainingQuantity} quantities` : "1 quantity"} has been completed for the event "${event.name}".`,
						betId: order.id
					})
				);

				const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, order);

				addUpdateBetSqlPayload(order.id, unmatchedQuantity, profit, platformCommission);
				insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
			} else {
				addUpdateBetSqlPayload(order.id, unmatchedQuantity);
			}
		}

		if (remainingQuantity === 0 && bet.type === "sell" && bet.userId) {
			notificationSqlPayload.push(
				UserService.getNotificationSqlPayload(bet.userId, "bet_exit", {
					title: "Order Completed",
					message: `Your sell order on ${selectedOption.name} option for ${remainingQuantity > 1 ? `${remainingQuantity} quantities` : "1 quantity"} has been completed for the event "${event.name}".`,
					betId: bet.id
				})
			);

			const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, bet);

			addUpdateBetSqlPayload(bet.id, remainingQuantity, profit, platformCommission);
			insertSellPayoutTxSqlPayload.push(payoutTxSqlPayload);
		} else if (unmatchedQuantity !== remainingQuantity) {
			addUpdateBetSqlPayload(bet.id, remainingQuantity);
		}

		notificationSqlPayload.length && (await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`);

		if (updateBetSqlPayload.length) {
			const payload = updateBetSqlPayload.map(({ id, unmatchedQuantity, profit, platformCommission, updatedAt }) => [id, unmatchedQuantity, profit, platformCommission, updatedAt]);

			//noinspection SqlResolve
			updateBetSqlPayload.length &&
				(await sql`
          UPDATE "event".bet
          SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
              profit              = (update_data.profit)::decimal,
              platform_commission = (update_data.platform_commission)::decimal,
              updated_at          = update_data.updated_at
          FROM (VALUES ${
						//@ts-ignore
						sql(payload)
					}) AS update_data (id, unmatched_quantity, profit, platform_commission, updated_at)
          WHERE "event".bet.id = update_data.id
			`);
		}

		insertMatchedBetSqlPayload.length && (await sql`INSERT INTO "event".matched ${sql(insertMatchedBetSqlPayload)}`);
		insertSellPayoutTxSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(insertSellPayoutTxSqlPayload)}`);

		await removeBetFromQueue(sql, betId);
	});
};

/**
 * Flag to prevent concurrent execution of the match queue.
 */
let runMatchQueueRunning = false;

/**
 * Asynchronously runs the match queue.
 *
 * The function performs the following steps:
 * 1. Checks if the match queue is already running. If so, it returns immediately.
 * 2. Sets the flag to indicate that the match queue is running.
 * 3. Retrieves all bets from the bet queue in the database, ordered by creation date.
 * 4. Groups the retrieved bets by event.
 * 5. Iterates over each event and its associated bets. For each bet, it calls the matchOrder function to match the bet.
 * 6. Resets the flag to indicate that the match queue is not running.
 *
 * If an error occurs during the execution of the function, it logs the error and resets the flag.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the match queue has been run.
 */
const runMatchQueue = async (): Promise<void> => {
	try {
		if (runMatchQueueRunning) return;
		runMatchQueueRunning = true;

		const bets = (await db.sql`
        SELECT bet_id, event_id
        FROM "event".bet_queue
        ORDER BY created_at
		`) as [
			{
				betId: string;
				eventId: string;
			}
		];

		//@ts-ignore Object.groupBy Not implemented in the stable typescript version yet
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

/**
 * Sets an interval to run the match queue every 5 seconds.
 */
setInterval(runMatchQueue, 5 * 1000);

/**
 * This function retrieves bets that are eligible for liquidity matching.
 *
 * A bet is eligible for liquidity matching if it meets the following conditions:
 * - The event related to the bet is live and not frozen.
 * - The bet is placed by a user (not the platform).
 * - The bet is not a limit order.
 * - The bet has unmatched quantity.
 * - The bet was updated more than 20 seconds ago.
 * - For sell bets, the price per quantity is less than or equal to the platform's remaining liquidity.
 * - For buy bets, the difference between the win price and the price per quantity is less than or equal to the platform's remaining liquidity.
 * - If the event does not allow liquidity in between, the price per quantity is either less than or equal to the minimum liquidity percentage of the win price, or greater than or equal to the maximum liquidity percentage of the win price.
 * - If the event allows liquidity in between, the price per quantity is between the minimum and maximum liquidity percentages of the win price.
 * - The bet is not in the top 5 bets for the event.
 *
 * The returned bets are sorted by total price in descending order and creation date in ascending order.
 *
 * @returns {Promise<Array<Bet>>} Returns a promise that resolves to an array of Bet objects.
 * The Bet objects are the bets that are eligible for liquidity matching.
 */
const getLiquidityMatchableBets = async (): Promise<Array<Bet>> =>
	z.array(Bet).parse(
		await db.sql`
        SELECT *
        FROM (SELECT bet.*,
                     ROW_NUMBER()
                     OVER (PARTITION BY bet.event_id ORDER BY bet.price_per_quantity * bet.quantity DESC, bet.created_at) as row_number
              FROM "event".bet
                       JOIN "event".event ON bet.event_id = event.id
              WHERE event.status = 'live'
                AND event.frozen = false
                AND bet.user_id IS NOT NULL
                AND limit_order = false
                AND bet.unmatched_quantity > 0
                AND bet.updated_at < NOW() - INTERVAL '20 seconds'
                AND ((bet.type = 'sell' AND bet.price_per_quantity <= event.platform_liquidity_left) OR
                     (bet.type = 'buy' AND event.win_price - bet.price_per_quantity <= event.platform_liquidity_left))
                AND ((event.liquidity_in_between = false AND
                      (bet.price_per_quantity <= event.win_price * event.min_liquidity_percentage / 100 OR
                       bet.price_per_quantity >= event.win_price * event.max_liquidity_percentage / 100))
                  OR (event.liquidity_in_between = true AND
                      bet.price_per_quantity BETWEEN event.win_price * event.min_liquidity_percentage / 100 AND event.win_price * event.max_liquidity_percentage / 100))) as bets
        ORDER BY row_number`
	);
// WHERE row_number > 5

/**
 * This function places a counter liquidity bet for a given bet and event.
 *
 * A counter liquidity bet is a bet that is placed by the platform to match a user's bet.
 * The function performs the following steps:
 * - It calculates the unmatched quantity of the bet.
 * - If the bet is a sell bet, it generates a buy bet with the same price per quantity and quantity as the sell bet.
 * - If the unmatched quantity of the sell bet is zero, it generates a sell payout transaction and updates the sell bet.
 * - If the bet is a buy bet, it generates a buy bet with the win price of the event minus the price per quantity of the buy bet.
 * - It generates a matched bet with the bet and the counter buy bet.
 * - It updates the bet with the new unmatched quantity, profit, and platform commission.
 * - It inserts the counter buy bet and the matched bet into the database.
 * - It updates the event with the new platform liquidity left.
 * - It then generates a sell bet with the same price per quantity and quantity as the counter buy bet.
 * - It inserts the counter sell bet into the database and adds it to the bet queue.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Bet} bet - The bet object for which the counter liquidity bet is being placed.
 * @param {Event} event - The event object related to the bet.
 * @param {Option} selectedOption - The ID of the selected option for the bet.
 * @param {number} otherOption - The ID of the other option for the bet.
 * @param {number} quantity - The quantity of the bet.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the counter liquidity bet has been placed.
 */
const placeCounterLiquidityBet = async (sql: TransactionSql, bet: Bet, event: Event, selectedOption: Option, otherOption: number, quantity: number): Promise<void> => {
	let counterBuyBet: Bet;
	const unmatchedQuantity = bet.unmatchedQuantity - quantity;

	if (bet.type === "sell") {
		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, selectedOption.id, bet.pricePerQuantity, 0, quantity, "buy", bet.limitOrder, quantity, null, null, 0);

		if (unmatchedQuantity === 0) {
			const remainingQuantity = bet.quantity - quantity;
			const notificationSqlPayload = UserService.getNotificationSqlPayload(bet.userId as string, "bet_exit", {
				title: "Order Completed",
				message: `Your sell order on ${selectedOption.name} option for ${remainingQuantity > 1 ? `${remainingQuantity} quantities` : "1 quantity"} has been completed for the event "${event.name}".`,
				betId: bet.id
			});

			await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`;

			const { payoutTxSqlPayload, profit, platformCommission } = getSellPayoutTxSqlPayload(event, bet);

			await sql`INSERT INTO "wallet".transaction ${sql(payoutTxSqlPayload)}`;

			bet = {
				...bet,
				profit,
				platformCommission,
				unmatchedQuantity
			};
		}
	} else {
		counterBuyBet = generateInsertBetSqlPayload(null, bet.eventId, otherOption, event.winPrice - bet.pricePerQuantity, 0, quantity, "buy", bet.limitOrder, quantity, null, null, 0);
	}

	const insertMatchedBetSqlPayload = {
		betId: counterBuyBet.id,
		matchedBetId: bet.id,
		quantity,
		createdAt: new Date()
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
                updated_at              = ${new Date()}
            WHERE id = ${event.id}`;

	const counterSellBet = generateInsertBetSqlPayload(
		null,
		bet.eventId,
		counterBuyBet.optionId,
		counterBuyBet.pricePerQuantity,
		0,
		quantity,
		"sell",
		counterBuyBet.limitOrder,
		null,
		counterBuyBet.id,
		counterBuyBet.buyBetPricePerQuantity
	);

	const res = Bet.parse((await sql`INSERT INTO "event".bet ${sql(counterSellBet)} RETURNING *`)[0]);
	await addToBetQueue(sql, res);
};

/**
 * This function matches a bet with the liquidity engine.
 *
 * The liquidity engine is a system that provides liquidity to the betting platform by placing counter bets.
 * The function performs the following steps:
 * - It validates the selected option for the bet.
 * - It begins a SQL transaction and locks the event to prevent concurrent modifications.
 * - It retrieves the bet and event details from the database.
 * - If the event status is "completed" or the event is frozen, it returns immediately.
 * - It retrieves the bet again to check if any other bet has already matched with it.
 * - It calculates the price per quantity for the bet. If the bet is a sell bet, it uses the bet's price per quantity. If the bet is a buy bet, it uses the difference between the win price of the event and the price per quantity of the bet.
 * - If the price per quantity is greater than the platform's remaining liquidity, it returns immediately.
 * - It calculates the quantity that can be matched by the liquidity engine by dividing the platform's remaining liquidity by the price per quantity.
 * - It places a counter liquidity bet for the bet with the calculated quantity.
 *
 * @param {Bet} bet - The bet object to be matched with the liquidity engine.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the bet has been matched with the liquidity engine.
 */
const matchWithLiquidityEngine = async (bet: Bet): Promise<void> => {
	const { selectedOption, otherOption } = await validateOption(bet.eventId, bet.optionId);

	await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${bet.eventId}))`;
		const event = await getEvent(sql, bet.eventId);

		if (event.status === "completed" || event.frozen) return;

		bet = await getBet(sql, bet.id);

		const pricePerQuantity = bet.type === "sell" ? bet.pricePerQuantity : event.winPrice - bet.pricePerQuantity;
		if (pricePerQuantity > event.platformLiquidityLeft) return;
		const liquidityMatchableQuantity = Math.floor(event.platformLiquidityLeft / pricePerQuantity);

		await placeCounterLiquidityBet(sql, bet, event, selectedOption, otherOption.id, liquidityMatchableQuantity > bet.unmatchedQuantity ? bet.unmatchedQuantity : liquidityMatchableQuantity);
	});
};

/**
 * Flag to prevent concurrent execution of the liquidity engine.
 */
let liquidityEngineRunning = false;

/**
 * This function runs the liquidity engine.
 *
 * The liquidity engine is a system that provides liquidity to the betting platform by placing counter bets.
 * The function performs the following steps:
 * 1. Checks if the liquidity engine is already running. If so, it returns immediately.
 * 2. Sets the flag to indicate that the liquidity engine is running.
 * 3. Retrieves all bets that are eligible for liquidity matching.
 * 4. Groups the retrieved bets by event.
 * 5. Iterates over each event and its associated bets. For each bet, it calls the matchWithLiquidityEngine function to match the bet with the liquidity engine.
 * 6. Resets the flag to indicate that the liquidity engine is not running.
 *
 * If an error occurs during the execution of the function, it logs the error and resets the flag.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the liquidity engine has been run.
 */
const liquidityEngine = async (): Promise<void> => {
	try {
		if (liquidityEngineRunning) return;
		liquidityEngineRunning = true;
		const bets = await getLiquidityMatchableBets();

		//@ts-ignore Object.groupBy Not implemented in the stable typescript version yet
		const betsByEvents = Object.groupBy(bets, ({ eventId }) => eventId) as {
			[eventId: string]: Bet[];
		};

		await Promise.all(
			Object.keys(betsByEvents).map(async (event) => {
				for (const bet of betsByEvents[event]) {
					await matchWithLiquidityEngine(bet);
				}
			})
		);

		liquidityEngineRunning = false;
	} catch (e) {
		console.error("Error running liquidityEngine", e);
		liquidityEngineRunning = false;
	}
};

/**
 * Sets an interval to run the liquidity engine every 20 seconds.
 */
setInterval(liquidityEngine, 20 * 1000);

/**
 * This function cancels unmatched quantity of given bets.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Event} event - The event object related to the bets.
 * @param {Bet[]} bets - An array of Bet objects to be cancelled.
 *
 * The function performs the following steps:
 * 1. Checks if the bets array is empty. If so, it returns immediately.
 * 2. Initializes empty arrays for storing SQL payloads for transactions and bet updates.
 * 3. Iterates over each bet in the bets array. For each bet, it generates SQL payloads for transactions, bet updates and notifications.
 * 4. It inserts the notifications into the database.
 * 5. If there are any transactions, it inserts them into the database.
 * 6. If there are any bet updates, it updates the bets in the database.
 *
 * @returns {Promise<void>} Returns a promise that resolves when all bets have been cancelled.
 */
const cancelBets = async (sql: TransactionSql, event: Event, bets: Bet[]): Promise<void> => {
	if (!bets.length) return;

	const txSqlPayload: Transaction[] = [];

	//[id, soldQuantityReturn, rewardAmountUsed, updatedAt]
	const updateBuyBetSqlPayload: [string, number, number, Date][] = [];

	// [id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt]
	const updateBetSqlPayload: [string, number, number, number, number | null, number | null, Date][] = [];

	const notificationSqlPayload: UserService.Notification[] = [];

	for (const bet of bets) {
		const {
			txSqlPayload: _txSqlPayload,
			updateBuyBetSqlPayload: _updateBuyBetSqlPayload,
			updateBetSqlPayload: _updateBetSqlPayload,
			notificationSqlPayload: _notificationSqlPayload
		} = getCancelBetSqlPayload(bet, event, bet.unmatchedQuantity, await EventService.getOption(bet.optionId), true);

		_txSqlPayload && txSqlPayload.push(_txSqlPayload);
		notificationSqlPayload.push(..._notificationSqlPayload);

		if (_updateBuyBetSqlPayload) {
			const { id, soldQuantityReturn, rewardAmountReturn, updatedAt } = _updateBuyBetSqlPayload;
			updateBuyBetSqlPayload.push([id, soldQuantityReturn, rewardAmountReturn, updatedAt]);
		}

		const { id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt } = _updateBetSqlPayload;
		updateBetSqlPayload.push([id, quantity, unmatchedQuantity, rewardAmountUsed, profit, platformCommission, updatedAt]);
	}

	txSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);

	notificationSqlPayload.length && (await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`);

	Promise.all(
		notificationSqlPayload.map((payload) => {
			return getMessaging().send({
				notification: {
					title: payload.title,
					body: payload.message
				},
				topic: payload.userId
			});
		})
	).catch((error) => {
		console.error("Error sending notification in cancel bet function", error);
	});

	//noinspection SqlResolve
	updateBuyBetSqlPayload.length &&
		(await sql`
      UPDATE "event".bet
      SET sold_quantity      = sold_quantity - (update_data.sold_quantity_return)::int,
          reward_amount_used = reward_amount_used + (update_data.reward_amount_return)::decimal,
          updated_at         = update_data.updated_at
      FROM (VALUES ${
				//@ts-ignore
				sql(updateBuyBetSqlPayload)
			}) AS update_data (id, sold_quantity_return, reward_amount_return, updated_at)
      WHERE "event".bet.id = update_data.id
      RETURNING *`);

	//noinspection SqlResolve
	await sql`UPDATE "event".bet
            SET unmatched_quantity  = (update_data.unmatched_quantity)::int,
                quantity            = (update_data.quantity)::int,
                reward_amount_used  = (update_data.reward_amount_used)::decimal,
                profit              = (update_data.profit)::decimal,
                platform_commission = (update_data.platform_commission)::decimal,
                updated_at          = update_data.updated_at
            FROM (VALUES ${
							//@ts-ignore
							sql(updateBetSqlPayload)
						}) AS update_data (id, quantity, unmatched_quantity, reward_amount_used, profit, platform_commission,
                               updated_at)
            WHERE "event".bet.id = update_data.id`;
};

/**
 * This function cancels all remaining bets for a given event.
 *
 * @param {TransactionSql} sql - The SQL transaction object.
 * @param {Event} event - The event object related to the bets.
 *
 * The function performs the following steps:
 * 1. Retrieves all sell bets for the event that have unmatched quantity.
 * 2. Cancels each retrieved sell bet.
 * 3. Retrieves all buy bets for the event that have unmatched quantity.
 * 4. Cancels each retrieved buy bet.
 *
 * @returns {Promise<void>} Returns a promise that resolves when all remaining bets for the event have been cancelled.
 *
 * It is important to cancel sell bets first because that will update the sold quantity of the buy bets. So it's easier split the logic into two steps
 */
const cancelAllRemainingBets = async (sql: TransactionSql, event: Event): Promise<void> => {
	const sellBets = z.array(Bet).parse(
		await sql`
        SELECT *
        FROM "event".bet
        WHERE event_id = ${event.id}
          AND type = 'sell'
          AND unmatched_quantity > 0
		`
	);

	await cancelBets(sql, event, sellBets);

	const buyBets = z.array(Bet).parse(
		await sql`
        SELECT *
        FROM "event".bet
        WHERE event_id = ${event.id}
          AND type = 'buy'
          AND unmatched_quantity > 0
		`
	);

	await cancelBets(sql, event, buyBets);
};

/**
 * This function generates the payload for a winning bet payout transaction.
 *
 * @param {Event} event - The event object related to the bet.
 * @param {Bet} bet - The bet object for which the payout is being calculated.
 *
 * The function performs the following steps:
 * 1. Calculates the quantity of the bet that has won. This is the total quantity of the bet minus the quantity that has been sold.
 * 2. Calculates the profit, platform commission, and amount for the bet using the getProfitAndCommission function.
 * 3. Adjusts the amount by subtracting the reward amount used.
 * 4. Generates an object containing the details for updating the bet in the database.
 * 5. Generates a transaction payload for the payout transaction using the generateTxSqlPayload function.
 *
 * @param option - The winning option for the event.
 * @returns {Object} Returns an object containing the update bet payload and the transaction payload.
 * The update bet payload is an object containing the details for updating the bet in the database.
 * The transaction payload is an object containing the details for the payout transaction.
 */
const getBetWinningPayoutTxSqlPayload = async (
	event: Event,
	bet: Bet,
	option: Option
): Promise<{
	updateBetPayload: {
		id: string;
		profit: number;
		platformCommission: number;
		updatedAt: Date;
	};
	txPayload: Transaction;
	notificationPayload: UserService.Notification;
	pointSqlPayload: UserService.Point;
}> => {
	//Only buy bets will win an event. So soldQuantity will always be a number because it's a buy bet. So, casting it as number
	const quantity = bet.quantity - (bet.soldQuantity as number);

	const { profit, platformCommission, amount: _amount } = getProfitAndCommission(quantity, bet.pricePerQuantity, event.winPrice, event.platformFeesPercentage);

	const amount = _amount - bet.rewardAmountUsed;

	const updateBetPayload = {
		id: bet.id,
		profit,
		platformCommission,
		updatedAt: new Date()
	};

	const txPayload = generateTxSqlPayload(bet.userId as string, "bet_win", amount, bet.rewardAmountUsed, event.token, event.chain, null, "completed", bet.id, quantity);

	const notificationPayload = UserService.getNotificationSqlPayload(bet.userId as string, "bet_win", {
		title: "Bet Won",
		message: `Your buy order on ${option.name} option for ${quantity > 1 ? `${quantity} quantities` : "1 quantity"} has won for the event "${event.name}".`,
		betId: bet.id
	});

	const token = WalletService.TokenCombination.find((token) => token.chain === event.chain && token.token === event.token) as {
		address: string;
		token: Token;
	};

	const points = Math.ceil(0.2 * _amount * (await WalletService.getTokenConversionRate(token.address, token.token)));

	const pointSqlPayload = UserService.getPointSqlPayload(bet.userId as string, "bet_win", points, {
		betId: bet.id
	});

	return {
		updateBetPayload,
		txPayload,
		notificationPayload,
		pointSqlPayload
	};
};
/**
 * This function resolves an event.
 *
 * @param {string} eventId - The ID of the event to be resolved.
 *
 * The function performs the following steps:
 * 1. Begins a SQL transaction and locks the event to prevent concurrent modifications.
 * 2. Retrieves the event details from the database.
 * 3. Cancels all remaining bets for the event.
 * 4. If the event does not have a winning option or is already resolved, it returns immediately.
 * 5. Updates all buy bets for the event that did not select the winning option, setting their profit to negative and their platform commission to zero.
 * 6. Updates all buy bets with all quantity sold by setting their profit and platform commission to zero.
 * 7. Retrieves all buy bets for the event that selected the winning option and the quantity - sold quantity is greater than 0.
 * 8. If there are no such bets, it returns immediately.
 * 9. For each retrieved bet, it generates a payout transaction SQL payload and a bet update SQL payload.
 * 10. If there are any transactions, it inserts them into the database.
 * 11. If there are any bet updates, it updates the bets in the database.
 * 12. Updates the event to mark it as resolved.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the event has been resolved.
 */
const resolveEvent = async (eventId: string): Promise<void> => {
	await db.sql.begin(async (sql) => {
		await sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`;
		const event = await getEvent(sql, eventId);

		await cancelAllRemainingBets(sql, event);

		if (!event.optionWon || event.resolved) return;

		await sql`UPDATE "event".bet
              SET profit              = -(bet.price_per_quantity * bet.quantity),
                  platform_commission = 0
              WHERE type = 'buy'
                AND option_id <> ${event.optionWon}
                AND user_id IS NOT NULL
                AND event_id = ${eventId}`;

		await sql`UPDATE "event".bet
              SET profit              = 0,
                  platform_commission = 0
              WHERE type = 'buy'
                AND event_id = ${eventId}
                AND user_id IS NOT NULL
                AND quantity - sold_quantity = 0`;

		const bets = z.array(Bet).parse(
			await sql`
          SELECT *
          FROM "event".bet
          WHERE event_id = ${eventId}
            AND type = 'buy'
            AND option_id = ${event.optionWon}
            AND quantity - bet.sold_quantity > 0
            AND user_id IS NOT NULL
			`
		);

		const txSqlPayload: Transaction[] = [];
		const notificationSqlPayload: UserService.Notification[] = [];
		const pointSqlPayload: UserService.Point[] = [];

		//[id, profit, platformCommission, updatedAt]
		const updateBetSqlPayload: [string, number, number, Date][] = [];

		for (const bet of bets) {
			const {
				updateBetPayload,
				txPayload,
				notificationPayload: _notificationPayload,
				pointSqlPayload: _pointSqlPayload
			} = await getBetWinningPayoutTxSqlPayload(event, bet, await EventService.getOption(event.optionWon));
			txSqlPayload.push(txPayload);
			notificationSqlPayload.push(_notificationPayload);
			pointSqlPayload.push(_pointSqlPayload);
			const { id, profit, platformCommission, updatedAt } = updateBetPayload;
			updateBetSqlPayload.push([id, profit, platformCommission, updatedAt]);
		}

		//noinspection SqlResolve
		updateBetSqlPayload.length &&
			(await sql`
        UPDATE "event".bet
        SET profit              = (update_data.profit)::decimal,
            platform_commission = (update_data.platform_commission)::decimal,
            updated_at          = update_data.updated_at
        FROM (VALUES ${
					//@ts-ignore
					sql(updateBetSqlPayload)
				}) AS update_data (id, profit, platform_commission, updated_at)
        WHERE "event".bet.id = update_data.id
		`);

		txSqlPayload.length && (await sql`INSERT INTO "wallet".transaction ${sql(txSqlPayload)}`);

		notificationSqlPayload.length && (await sql`INSERT INTO "user".notification ${sql(notificationSqlPayload)}`);

		pointSqlPayload.length && (await sql`INSERT INTO "user".point ${sql(pointSqlPayload)}`);

		await sql`UPDATE "event".event
              SET resolved    = true,
                  resolved_at = NOW()
              WHERE id = ${eventId}`;
	});
};

/**
 * Flag to prevent concurrent execution of the event payout initialization.
 */
let initEventPayoutRunning = false;

/**
 * This function initializes the payout for all completed but unresolved events.
 *
 * The function performs the following steps:
 * 1. Checks if the event payout initialization is already running. If so, it returns immediately.
 * 2. Retrieves all events from the database that are completed but not yet resolved.
 * 3. Iterates over each event and calls the resolveEvent function to resolve the event.
 * 4. Sets the flag to indicate that the event payout initialization is running.
 * 5. Resets the flag to indicate that the event payout initialization is not running.
 *
 * If an error occurs during the execution of the function, it logs the error and resets the flag.
 *
 * @returns {Promise<void>} Returns a promise that resolves when the event payout initialization has been run.
 */
const initEventPayout = async (): Promise<void> => {
	try {
		if (initEventPayoutRunning) return;

		const events = z.array(Event).parse(
			await db.sql`
          SELECT *
          FROM "event".event
          WHERE status = 'completed'
            AND resolved = false
			`
		);

		for (const event of events) {
			await resolveEvent(event.id);
		}

		initEventPayoutRunning = true;

		initEventPayoutRunning = false;
	} catch (e) {
		console.error("Error updating event status", e);
		initEventPayoutRunning = false;
	}
};

setInterval(initEventPayout, 5 * 1000);

export { Bet, BetType, BetStatus, placeBet, getBets, cancelBet, isTop5Bet, getBet, getInvestedAndCurrentAmount };
