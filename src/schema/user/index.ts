import { builder } from "../../config";
import { UserService } from "../../service";
import { ErrorUtil } from "../../util";
import { ReferralCode, Social, User, UserLoginResponse } from "./object.ts";

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
			instagram: t.arg.string({ required: true, description: "The Instagram username of the user." }),
			about: t.arg.string({ required: true, description: "The about section of the user." })
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

export { User };
