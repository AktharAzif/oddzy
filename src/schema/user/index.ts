import { builder } from "../../config";
import { UserService } from "../../service";
import { ErrorUtil } from "../../util";
import { LeaderboardPaginatedResponse, NotificationPaginatedResponse, ReferralCode, Social, TimeFilterEnum, User, UserLoginResponse, UserPaginatedResponse } from "./object.ts";

builder.queryField("twitterAuthUrl", (t) =>
	t.field({
		type: "String",
		resolve: async () => await UserService.getTwitterAuthURL(),
		description: "Fetches the Twitter authentication URL for OAuth2."
	})
);

builder.queryField("discordAuthUrl", (t) =>
	t.field({
		type: "String",
		resolve: async () => await UserService.getDiscordAuthURL(),
		description: "Fetches the Discord authentication URL for OAuth2."
	})
);

builder.mutationField("login", (t) =>
	t.field({
		type: UserLoginResponse,
		args: {
			code: t.arg.string({ required: true, description: "The code received from the Twitter OAuth2 callback." }),
			state: t.arg.string({ required: true, description: "The state received from the Twitter OAuth2 callback." })
		},
		resolve: async (_, { code, state }) => await UserService.loginWithTwitter(code, state),
		description: "Handles the login process with Twitter OAuth2 and returns JWT."
	})
);

builder.queryField("user", (t) =>
	t.field({
		type: User,
		args: {
			id: t.arg.string({
				description: "The unique identifier of the user."
			})
		},
		resolve: async (_, { id }, { user }) => {
			const userId = id || (user && user.id);
			if (!userId) throw new ErrorUtil.HttpException(400, "Either user id must be provided or user must be logged in.");
			return await UserService.getUser(userId);
		},
		description: "Fetches a user based on the provided id. If no id is provided, it tries to fetch the id from the logged-in user."
	})
);

builder.mutationField("getAccess", (t) =>
	t.field({
		authScopes: { user: true },
		type: "Boolean",
		args: {
			referralCode: t.arg.string({ required: true, description: "The referral code for getting access." })
		},
		resolve: async (_, { referralCode }, { user }) => {
			if (user?.access) return true;
			await UserService.getAccess((user as UserService.User).id, referralCode);
			return true;
		},
		description: "Gets access to the platform using a referral code."
	})
);

builder.mutationField("connectDiscord", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || false,
		type: Social,
		args: {
			code: t.arg.string({ required: true, description: "The code received from the Discord OAuth2 login." })
		},
		resolve: async (_, { code }, { user }) => {
			return await UserService.connectDiscord((user as UserService.User).id, code);
		},
		description: "Connects the Discord account to the user using OAuth2."
	})
);

builder.mutationField("updateUser", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || false,
		type: User,
		args: {
			instagram: t.arg.string({ description: "The Instagram username of the user." }),
			about: t.arg.string({ description: "The about section of the user." })
		},
		resolve: async (_, { instagram, about }, { user }) => {
			return await UserService.updateUser((user as UserService.User).id, about, instagram);
		},
		description: "Updates the user's Instagram username and about section."
	})
);

builder.queryField("referralCodes", (t) =>
	t.field({
		authScopes: (_, __, { user }) => (user && user.access) || false,
		type: [ReferralCode],
		resolve: async (_, __, { user }) => {
			return await UserService.getReferralCodes((user as UserService.User).id);
		},
		description: "Fetches the referral codes of the user."
	})
);

builder.queryField("users", (t) =>
	t.field({
		type: UserPaginatedResponse,
		authScopes: { admin: true },
		args: {
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				validate: { min: 1 },
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				validate: { min: 1, max: 100 },
				description: "The limit of categories per page. Min 1, Max 100."
			})
		},
		resolve: async (_, { page, limit }) => await UserService.getAllUsers(page - 1, limit),
		description: "Get a list of all users. Can only be accessed by the admin."
	})
);

builder.mutationField("addFcmToken", (t) =>
	t.field({
		authScopes: { user: true },
		type: "Boolean",
		args: {
			token: t.arg.string({ required: true, description: "The FCM token of the user." })
		},
		resolve: async (_, { token }, { user }) => {
			await UserService.addFcmToken((user as UserService.User).id, token);
			return true;
		},
		description: "Adds the FCM token of the user for push notifications."
	})
);

builder.queryField("notifications", (t) =>
	t.field({
		type: NotificationPaginatedResponse,
		authScopes: { user: true },
		args: {
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				validate: { min: 1 },
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				validate: { min: 1, max: 100 },
				description: "The limit of notifications per page. Min 1, Max 100."
			})
		},
		resolve: async (_, { page, limit }, { user }) => await UserService.getNotifications((user as UserService.User).id, page - 1, limit),
		description: "Fetches the notifications of the user."
	})
);

builder.mutationField("markNotificationAsRead", (t) =>
	t.field({
		authScopes: { user: true },
		type: "Boolean",
		args: {
			id: t.arg.string({ required: true, description: "The id of the notification." })
		},
		resolve: async (_, { id }, { user }) => {
			await UserService.markNotificationAsRead((user as UserService.User).id, id);
			return true;
		},
		description: "Marks the notification as read."
	})
);

builder.queryField("leaderboard", (t) =>
	t.field({
		type: LeaderboardPaginatedResponse,
		args: {
			timeFilter: t.arg({
				type: TimeFilterEnum,
				required: true,
				description: "The time filter for the leaderboard. It can be either day, week, month, year or all.",
				defaultValue: "all"
			}),
			page: t.arg.int({
				required: true,
				defaultValue: 1,
				validate: { min: 1 },
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				defaultValue: 20,
				validate: { min: 1, max: 100 },
				description: "The limit of users per page. Min 1, Max 100."
			})
		},
		resolve: async (_, { timeFilter, page, limit }) => await UserService.getLeaderboard(timeFilter, page - 1, limit),
		description: "Fetches the points leaderboard of the users."
	})
);

export { User, UserPaginatedResponse, NotificationPaginatedResponse, LeaderboardPaginatedResponse, TimeFilterEnum };
