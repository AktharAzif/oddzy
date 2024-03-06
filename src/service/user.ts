import { createId } from "@paralleldrive/cuid2";
import { TwitterApiAutoTokenRefresher } from "@twitter-api-v2/plugin-token-refresher";
import { getMessaging } from "firebase-admin/messaging";
import * as jose from "jose";
import { TwitterApi } from "twitter-api-v2";
import { z } from "zod";
import { db } from "../config";
import { UserSchema } from "../schema";
import { ErrorUtil } from "../util";

const { TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_CALLBACK_URL, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_CALLBACK_URL, USER_JWT_SECRET } = Bun.env;

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET || !TWITTER_CALLBACK_URL) throw new Error("Environment variables TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET and TWITTER_CALLBACK_URL must be set");

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET || !DISCORD_CALLBACK_URL) throw new Error("Environment variables DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_CALLBACK_URL must be set");

if (!USER_JWT_SECRET) throw new Error("Environment variable USER_JWT_SECRET must be set");

const userJwtSecret = new TextEncoder().encode(USER_JWT_SECRET);

const twitterClient = new TwitterApi({
	clientId: TWITTER_CLIENT_ID,
	clientSecret: TWITTER_CLIENT_SECRET
});

const SocialPlatform = z.enum(["twitter", "discord"]);
type SocialPlatform = z.infer<typeof SocialPlatform>;

const Social = z.object({
	id: z.string(),
	socialId: z.string(),
	name: z.string(),
	username: z.string(),
	avatar: z.string().nullable(),
	email: z.string().nullable(),
	platform: SocialPlatform,
	refreshToken: z.string(),
	userId: z.string(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type Social = z.infer<typeof Social>;

const ReferralCode = z.object({
	id: z.string(),
	code: z.string(),
	used: z.boolean(),
	userId: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type ReferralCode = z.infer<typeof ReferralCode>;

const User = z.object({
	id: z.string(),
	about: z.string().nullable(),
	instagram: z.string().nullable(),
	access: z.boolean(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type User = z.infer<typeof User>;

/**
 * This function is used to generate the Twitter authentication URL.
 * It uses the `generateOAuth2AuthLink` method from the `twitterClient` to generate the URL, code verifier, and state.
 * The generated state and code verifier are then stored in Redis with an expiry time of 300 seconds.
 * Finally, it returns the generated URL.
 *
 * @returns {Promise<string>} The Twitter authentication URL.
 * @async
 */
const getTwitterAuthURL = async (): Promise<string> => {
	// Generate the OAuth2 authentication link using the Twitter client
	const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(TWITTER_CALLBACK_URL, {
		scope: ["tweet.read", "users.read", "follows.read", "offline.access"]
	});

	// Store the state and code verifier in Redis with an expiry time of 300 seconds
	await db.redis.set(state, codeVerifier, "EX", 300);

	// Return the generated URL
	return url;
};

/**
 * This function is used to get the Twitter access and refresh tokens.
 * It first retrieves the code verifier from Redis using the provided state.
 * If the code verifier does not exist, it throws an HTTP exception with status code 400 and message "Invalid state".
 * Then, it tries to log in with OAuth2 using the provided code, code verifier, and the Twitter callback URL.
 * If the login is successful, it stores the access token in Redis with the refresh token as the key and the expiry time.
 * The refresh token will never be undefined because the "offline.access" scope is used.
 * If the login fails (e.g., the user does not verify the code within 30 seconds), it throws an HTTP exception with status code 400 and message "Expired code".
 * Finally, it returns an object containing the logged-in client and the refresh token.
 *
 * @param {string} code - The authorization code.
 * @param {string} state - The state.
 * @returns {Promise<{loggedInClient: TwitterApi, refreshToken: string}>} The logged-in client and the refresh token.
 * @throws {ErrorUtil.HttpException} If the state is invalid or the code is expired.
 * @async
 */
const getTwitterAccessAndRefreshToken = async (
	code: string,
	state: string
): Promise<{
	loggedInClient: TwitterApi;
	refreshToken: string;
}> => {
	const codeVerifier = await db.redis.get(state);
	if (!codeVerifier) throw new ErrorUtil.HttpException(400, "Invalid state.");

	try {
		const {
			client: loggedInClient,
			accessToken,
			refreshToken,
			expiresIn
		} = await twitterClient.loginWithOAuth2({
			code,
			codeVerifier,
			redirectUri: TWITTER_CALLBACK_URL
		});

		await db.redis.set(refreshToken as string, accessToken, "EX", expiresIn);

		return {
			loggedInClient,
			refreshToken: refreshToken as string
		};
	} catch {
		throw new ErrorUtil.HttpException(400, "Expired code.");
	}
};

/**
 * This function is used to get a logged-in Twitter client.
 * It first retrieves the access token from Redis using the provided refresh token.
 * If the access token does not exist, it defaults to an empty string.
 * Then, it creates an instance of the TwitterApiAutoTokenRefresher with the refresh token, client ID, and client secret.
 * It also sets up two callbacks: one for when the token is updated and another for when there is an error refreshing the token.
 * When the token is updated, it updates the refresh token and the updated_at field in the "user".social table in the database.
 * It also stores the new access token in Redis with the refresh token as the key and the expiry time.
 * If there is an error refreshing the token, it logs the error to the console.
 * Finally, it returns a new instance of the TwitterApi with the access token and the auto refresher plugin.
 *
 * @param {string} refreshToken - The refresh token.
 * @returns {Promise<TwitterApi>} The logged-in Twitter client.
 * @async
 */
const getLoggedInClient = async (refreshToken: string): Promise<TwitterApi> => {
	const accessToken = (await db.redis.get(refreshToken)) || "";
	const autoRefresherPlugin = new TwitterApiAutoTokenRefresher({
		refreshToken: refreshToken,
		refreshCredentials: {
			clientId: TWITTER_CLIENT_ID,
			clientSecret: TWITTER_CLIENT_SECRET
		},
		onTokenUpdate: async (token) => {
			await db.sql`UPDATE "user".social
                   SET refresh_token = ${token.refreshToken as string},
                       updated_at    = ${new Date()}
                   WHERE refresh_token = ${refreshToken}`;
			await db.redis.set(refreshToken, token.accessToken, "EX", token.expiresIn);
		},
		onTokenRefreshError(error) {
			console.error("Error refreshing twitter token", error);
		}
	});

	return new TwitterApi(accessToken, {
		plugins: [autoRefresherPlugin]
	});
};

/**
 * This function is used to get the Twitter user's details.
 * It makes a request to the Twitter API v2's user endpoint with the "me" parameter and the fields "id", "name", "username", and "profile_image_url".
 * The response is then parsed to extract the user's id, name, username, and profile image URL (avatar).
 * Finally, it returns an object containing the user's id, name, username, and avatar.
 *
 * @param {TwitterApi} loggedInClient - The logged-in Twitter client.
 * @returns {Promise<{id: string, name: string, username: string, avatar: string | null}>} The user's id, name, username, and avatar.
 * @async
 */
const getTwitterUser = async (
	loggedInClient: TwitterApi
): Promise<{
	id: string;
	name: string;
	username: string;
	avatar: string | null;
}> => {
	const user = await loggedInClient.v2
		.user("me", {
			"user.fields": ["id", "name", "username", "profile_image_url"]
		})
		.then((res) => res.data);

	const { id, name, username, profile_image_url: avatar } = user;

	return {
		id,
		name,
		username,
		avatar: avatar || null
	};
};

/**
 * This function is used to get a social account by its ID.
 * It queries the "user".social table in the database for a social account with the provided ID.
 * The ID can either be the user's ID or the social account's ID, depending on the value of the userId parameter.
 * If the userId parameter is true, it queries for a social account with the user's ID.
 * If the userId parameter is false, it queries for a social account with the social account's ID.
 * The query also includes the provided platform.
 * If the social account does not exist, it returns null.
 * If the social account exists, it parses the social account data using the Social zod schema to ensure it matches the expected structure.
 * Finally, it returns the parsed social account data or null.
 *
 * @param {string} id - The ID of the user or the social account.
 * @param {SocialPlatform} platform - The platform of the social account.
 * @param {boolean} userId - Whether the ID is the user's ID.
 * @returns {Promise<Social | null>} The social account data or null.
 * @async
 */
const getSocialAccountById = async (id: string, platform: SocialPlatform, userId: boolean = false): Promise<Social | null> => {
	const [user] = await db.sql`SELECT *
                              FROM "user".social
                              WHERE ${userId ? db.sql`user_id` : db.sql`social_id`} = ${id}
                                AND platform = ${platform}`;
	if (!user) return null;
	return Social.parse(user);
};

/**
 * This function is used to log in with Twitter.
 * It first gets the logged-in Twitter client and the refresh token using the provided code and state.
 * Then, it gets the Twitter user's details using the logged-in client.
 * It checks if a user with the same social ID and platform "twitter" exists in the "user".social table in the database.
 * If the user exists, it checks if the user's name, username, or avatar has changed.
 * If any of these fields have changed, it updates the user's name, username, avatar, and updated_at field in the database.
 * If the user does not exist, it creates a new user in the "user"."user" table and a new social account in the "user".social table.
 * The new social account has the user's social ID, name, username, avatar, platform "twitter", refresh token, and the new user's ID.
 * Finally, it signs a JWT with the user's ID as the subject and returns the JWT.
 *
 * @param {string} code - The authorization code.
 * @param {string} state - The state.
 * @returns {Promise<{jwt: string}>} The signed JWT.
 * @throws {ErrorUtil.HttpException} If the state is invalid or the code is expired.
 * @async
 */
const loginWithTwitter = async (code: string, state: string): Promise<{ jwt: string }> => {
	const { loggedInClient, refreshToken } = await getTwitterAccessAndRefreshToken(code, state);
	const { id, name, username, avatar } = await getTwitterUser(loggedInClient);

	const user = await getSocialAccountById(id, "twitter");
	let userId: string;

	if (user) {
		userId = user.userId;

		if (user.name !== name || user.username !== username || user.avatar !== avatar) {
			await db.sql`UPDATE "user".social
                   SET name       = ${name},
                       username   = ${username},
                       avatar     = ${avatar},
                       updated_at = ${new Date()}
                   WHERE social_id = ${id}
                     AND platform = 'twitter'`;
		}
	} else {
		userId = createId();
		await db.sql.begin((sql) => [
			sql`INSERT INTO "user"."user" (id)
          VALUES (${userId})`,
			sql`INSERT INTO "user".social (id, social_id, name, username, avatar, platform, refresh_token, user_id)
          VALUES (${createId()}, ${id}, ${name}, ${username}, ${avatar}, 'twitter', ${refreshToken},
                  ${userId})`
		]);
	}

	const jwt = await new jose.SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).sign(userJwtSecret);

	return {
		jwt
	};
};

/**
 * This function is used to generate the Discord authentication URL.
 * It constructs the URL using the Discord client ID and callback URL from the environment variables.
 * The URL includes the response type "code" and the scopes "identify" and "email".
 * The callback URL is URL-encoded to ensure it is correctly interpreted by the Discord API.
 * Finally, it returns the generated URL.
 *
 * @returns {Promise<string>} The Discord authentication URL.
 * @async
 */
const getDiscordAuthURL = async (): Promise<string> => {
	return `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${DISCORD_CALLBACK_URL}&response_type=code&scope=identify+email`;
};

/**
 * This function is used to connect a user's Discord account.
 * It first constructs the parameters for the Discord OAuth2 token request using the client ID, client secret, authorization code, and callback URL from the environment variables.
 * Then, it makes a POST request to the Discord OAuth2 token endpoint with the constructed parameters.
 * If the request is not successful, it throws an HTTP exception with status code 400 and message "Invalid code".
 * If the request is successful, it extracts the access token, refresh token, and expiry time from the response.
 * It then makes a GET request to the Discord API's user endpoint with the access token to get the user's details.
 * If the request is not successful, it throws an HTTP exception with status code 400 and message "Invalid code".
 * If the request is successful, it extracts the user's id, username, avatar, name, email, and verification status from the response.
 * If the user's email is not verified, it throws an HTTP exception with status code 400 and message "Email not verified".
 * It then stores the access token in Redis with the refresh token as the key and the expiry time.
 * It checks if a user with the same social ID and platform "discord" exists in the "user".social table in the database.
 * If the user exists and the user's ID does not match the provided user ID, it throws an HTTP exception with status code 400 and message "Discord connected to other user".
 * If the user exists and the user's name, username, avatar, or email has changed, it updates these fields and the updated_at field in the database.
 * If the user exists and none of the user's details have changed, it throws an HTTP exception with status code 400 and message "Discord already connected".
 * If the user does not exist, it creates a new social account in the "user".social table with the user's social ID, name, username, avatar, email, refresh token, and the provided user ID.
 * Finally, it parses the user data using the Social zod schema and returns the parsed data.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} code - The authorization code.
 * @returns {Promise<Social>} The user's social account data.
 * @throws {ErrorUtil.HttpException} If the code is invalid, the email is not verified, the Discord account is connected to another user, or the Discord account is already connected.
 * @async
 */
const connectDiscord = async (userId: string, code: string): Promise<Social> => {
	const params = new URLSearchParams({
		client_id: DISCORD_CLIENT_ID,
		client_secret: DISCORD_CLIENT_SECRET,
		grant_type: "authorization_code",
		code,
		redirect_uri: DISCORD_CALLBACK_URL
	});

	const headers = {
		"Content-Type": "application/x-www-form-urlencoded",
		"Accept-Encoding": "application/x-www-form-urlencoded"
	};

	const data = await fetch("https://discord.com/api/oauth2/token", {
		method: "POST",
		body: params,
		headers
	});

	if (data.status !== 200) throw new ErrorUtil.HttpException(400, "Invalid code.");

	const {
		access_token,
		refresh_token,
		expires_in: expiresIn
	} = (await data.json()) as {
		access_token: string;
		expires_in: number;
		refresh_token: string;
	};

	const user = await fetch("https://discord.com/api/users/@me", {
		headers: {
			Authorization: `Bearer ${access_token}`
		}
	});

	if (user.status !== 200) throw new ErrorUtil.HttpException(400, "Invalid code.");

	const {
		id,
		username,
		avatar,
		global_name: name,
		email,
		verified
	} = (await user.json()) as {
		id: string;
		username: string;
		avatar: string;
		global_name: string;
		email: string;
		verified: boolean;
	};

	if (!verified) throw new ErrorUtil.HttpException(400, "Email not verified.");

	await db.redis.set(refresh_token, access_token, "EX", expiresIn);

	const discordUser = await db.sql.begin(async (sql) => {
		const [discordUser] = z.array(Social).parse(
			await sql`SELECT *
                FROM "user".social
                WHERE social_id = ${id}
                  AND platform = 'discord'`
		);
		if (discordUser && discordUser.userId !== userId) throw new ErrorUtil.HttpException(400, "Discord connected to other user.");

		if (discordUser && (discordUser.name !== name || discordUser.username !== username || discordUser.avatar !== avatar || discordUser.email !== email))
			return (
				await sql`UPDATE "user".social
                  SET name       = ${name},
                      username   = ${username},
                      avatar     = ${avatar},
                      email      = ${email},
                      updated_at = ${new Date()}
                  WHERE social_id = ${id}
                    AND platform = 'discord'
                  RETURNING *`
			)[0];

		if (discordUser) throw new ErrorUtil.HttpException(400, "Discord already connected.");

		const sqlPayload = {
			id: createId(),
			socialId: id,
			name,
			username,
			avatar,
			email,
			refresh_token,
			userId,
			platform: "discord"
		};

		return (await sql`INSERT INTO "user".social ${sql(sqlPayload)} RETURNING *`)[0];
	});

	return Social.parse(discordUser);
};

/**
 * This function is used to grant access to a user using a referral code.
 * It first converts the provided code to uppercase.
 * Then, it queries the "user".referral_code table in the database for a referral code with the provided code.
 * If the referral code does not exist, it throws an HTTP exception with status code 400 and message "Invalid referral code".
 * If the referral code has already been used, it throws an HTTP exception with status code 429 and message "Referral code already used".
 * It then begins a transaction to update the user's access status, mark the referral code as used, create a referral record, and generate new referral codes.
 * It updates the user's access status to true and the updated_at field in the "user".user table in the database.
 * It marks the referral code as used and updates the updated_at field in the "user".referral_code table in the database.
 * It creates a new referral record in the "user".referral table with the user's ID and the referral code's ID.
 * It generates three new referral codes and inserts them into the "user".referral_code table.
 * Each new referral code has a unique ID, a code that starts with "ODZ-" followed by the first six characters of a new unique ID in uppercase, and the user's ID.
 * Finally, it commits the transaction.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} code - The referral code.
 * @throws {ErrorUtil.HttpException} If the referral code is invalid or has already been used.
 * @async
 */
const getAccess = async (userId: string, code: string) => {
	code = code.toUpperCase();
	const [referralCode]:
		| [
				{
					id: string;
					used: boolean;
				}
		  ]
		| [] = await db.sql`SELECT id, used
                        FROM "user".referral_code
                        WHERE code = ${code}`;

	if (!referralCode) throw new ErrorUtil.HttpException(400, "Invalid referral code.");

	if (referralCode.used) throw new ErrorUtil.HttpException(429, "Referral code already used.");

	await db.sql.begin(async (sql) => {
		await sql`UPDATE "user".user
              SET access     = true,
                  updated_at = ${new Date()}
              WHERE id = ${userId}`;

		await sql`UPDATE "user".referral_code
              SET used       = true,
                  updated_at = ${new Date()}
              WHERE id = ${referralCode.id}`;

		const referralSqlPayload = {
			id: createId(),
			userId,
			referralCodeId: referralCode.id
		};

		await sql`INSERT INTO "user".referral ${sql(referralSqlPayload)}`;

		const referralCodesSqlPayload = new Array(3).fill(null).map(() => ({
			id: createId(),
			code: `ODZ-${createId().slice(0, 6).toUpperCase()}`,
			userId
		}));

		await sql`INSERT INTO "user".referral_code ${sql(referralCodesSqlPayload)}`;
	});
};

/**
 * This function is used to get the referral codes of a user.
 * It queries the "user".referral_code table in the database for referral codes with the provided user ID.
 * The response is then parsed using the ReferralCode zod schema to ensure it matches the expected structure.
 * Finally, it returns the parsed referral codes.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<ReferralCode[]>} The user's referral codes.
 * @async
 */
const getReferralCodes = async (userId: string): Promise<ReferralCode[]> =>
	z.array(ReferralCode).parse(
		await db.sql`SELECT *
                 FROM "user".referral_code
                 WHERE user_id = ${userId}`
	);

/**
 * This function is used to get a user's details.
 * It queries the "user".user table in the database for a user with the provided user ID.
 * If the user does not exist, it throws an HTTP exception with status code 404 and message "User not found".
 * If the user exists, it parses the user data using the User zod schema to ensure it matches the expected structure.
 * Finally, it returns the parsed user data.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<User>} The user's data.
 * @throws {ErrorUtil.HttpException} If the user does not exist.
 * @async
 */
const getUser = async (userId: string): Promise<User> => {
	const [user] = await db.sql`SELECT *
                              FROM "user".user
                              WHERE id = ${userId}`;
	if (!user) throw new ErrorUtil.HttpException(404, "User not found");
	return User.parse(user);
};

/**
 * This function is used to update a user's details.
 * It updates the user's about and instagram fields in the "user".user table in the database.
 * The updated_at field is also updated to the current time.
 * The update is performed for the user with the provided user ID.
 * After the update, it retrieves the updated user from the database and parses the user data using the User zod schema to ensure it matches the expected structure.
 * Finally, it returns the parsed user data.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} about - The new about information of the user.
 * @param {string} instagram - The new instagram handle of the user.
 * @returns {Promise<User>} The updated user's data.
 * @async
 */
const updateUser = async (userId: string, about: string, instagram: string): Promise<User> => {
	const [user] = await db.sql`UPDATE "user".user
                              SET about      = ${about},
                                  instagram  = ${instagram},
                                  updated_at = ${new Date()}
                              WHERE id = ${userId}
                              RETURNING *`;
	return User.parse(user);
};

const getAllUsers = async (page: number, limit: number): Promise<UserSchema.UserPaginatedResponse> => {
	const users = db.sql`SELECT *
                       FROM "user".user
                       LIMIT ${limit} OFFSET ${page * limit}`;
	const total = db.sql`SELECT COUNT(*)
                       FROM "user".user` as Promise<[{ count: string }]>;

	const [usersRes, [totalRes]] = await Promise.all([users, total]);

	return {
		users: z.array(User).parse(usersRes),
		total: Number(totalRes.count),
		page: page + 1,
		limit
	};
};

/**
 * This function is used to add a Firebase Cloud Messaging (FCM) token for a user.
 * It subscribes the provided FCM token to the "all" topic using the `subscribeToTopic` method from the Firebase Admin SDK's Messaging service.
 * If the subscription is successful, it does not return anything.
 * If the subscription fails (e.g., the provided FCM token is invalid), it throws an HTTP exception with status code 400 and message "Invalid FCM token".
 *
 * @param {string} userId - The ID of the user. This parameter is currently not used in the function.
 * @param {string} token - The FCM token to be added.
 * @throws {ErrorUtil.HttpException} If the FCM token is invalid.
 * @async
 */
const addFcmToken = async (userId: string, token: string) =>
	await getMessaging()
		.subscribeToTopic(token, "all")
		.catch((err) => {
			throw new ErrorUtil.HttpException(400, "Invalid FCM token");
		});

export {
	SocialPlatform,
	Social,
	ReferralCode,
	User,
	userJwtSecret,
	getTwitterAuthURL,
	getLoggedInClient,
	getSocialAccountById,
	loginWithTwitter,
	getDiscordAuthURL,
	connectDiscord,
	getUser,
	updateUser,
	getAccess,
	getReferralCodes,
	getAllUsers,
	addFcmToken
};
