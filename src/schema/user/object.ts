import { builder } from "../../config";
import { UserService } from "../../service";

const UserLoginResponse = builder.objectRef<{ jwt: string }>("UserLoginResponse").implement({
	fields: (t) => ({
		jwt: t.exposeString("jwt", {
			description: "The JWT from the Twitter OAuth2 login."
		})
	}),
	description: "The response object for the Twitter OAuth2 login."
});

const User = builder.objectRef<UserService.User>("User");
User.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the user."
		}),
		access: t.exposeBoolean("access", {
			authScopes: ({ id }, args, { admin, user }) => (user && user.id === id) || admin,
			description:
				"This field determines whether the user can access all platform features. This field represents whether user have successfully completed the referral process. Only the user itself and the admin can access this field."
		}),
		about: t.exposeString("about", {
			nullable: true,
			description: "The about section of the user."
		}),

		instagram: t.exposeString("instagram", {
			nullable: true,
			description: "The Instagram username of the user."
		}),
		twitter: t.field({
			type: Social,
			//Casting the return type to UserService.Social because Twitter account is always present since it is used for login
			resolve: async (parent) => (await UserService.getSocialAccountById(parent.id, "twitter", true)) as UserService.Social,
			description: "The Twitter account of the user."
		}),
		discord: t.field({
			type: Social,
			resolve: async (parent) => await UserService.getSocialAccountById(parent.id, "discord", true),
			nullable: true,
			description: "The Discord account of the user."
		}),
		referralCodes: t.field({
			type: [ReferralCode],
			authScopes: ({ id }, args, { admin, user }) => (user && user.id === id) || admin,
			resolve: async (parent) => await UserService.getReferralCodes(parent.id),
			description: "The referral codes associated with the user. Only the user itself and the admin can access this field."
		}),
		createdAt: t.field({
			authScopes: ({ id }, args, { admin, user }) => (user && user.id === id) || admin,
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the user was created. Only the user itself and the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the user was last updated. Only the admin can access this field."
		})
	}),
	description: "The user response object."
});

const Social = builder.objectRef<UserService.Social>("Social");
Social.implement({
	fields: (t) => ({
		id: t.exposeString("socialId", {
			description: "The unique identifier of the social account."
		}),
		username: t.exposeString("username", {
			description: "The username of the social account."
		}),
		name: t.exposeString("name", {
			description: "The display name of the social account."
		}),
		avatar: t.exposeString("avatar", {
			nullable: true,
			description: "The avatar URL of the social account."
		}),
		email: t.exposeString("email", {
			nullable: true,
			authScopes: { admin: true },
			description: "The email of the social account. Only the admin can access this field."
		}),
		userId: t.exposeString("userId", {
			description: "Id of the user associated with the social account."
		}),
		user: t.field({
			type: User,
			resolve: async (parent) => await UserService.getUser(parent.userId),
			description: "The user associated with the social account."
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the social account was created. Only the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the social account was last updated. Only the admin can access this field."
		})
	}),
	description: "The social account response object."
});

const ReferralCode = builder.objectRef<UserService.ReferralCode>("ReferralCode");
ReferralCode.implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the referral code."
		}),
		userId: t.exposeString("userId", {
			description: "Id of the user associated with the referral code.",
			nullable: true
		}),
		user: t.field({
			type: User,
			resolve: async (parent) => {
				if (parent.userId) {
					return await UserService.getUser(parent.userId);
				}
				return null;
			},
			nullable: true,
			description: "The user associated with the referral code."
		}),
		code: t.exposeString("code", {
			description: "The referral code."
		}),
		used: t.exposeBoolean("used", {
			description: "The status of the referral code. If true, the referral code has been used."
		}),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The date and time when the referral code was created. Only the admin can access this field."
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The date and time when the referral code was last updated. Only the admin can access this field."
		})
	}),
	description: "The referral code response object."
});

const UserPaginatedResponse = builder.objectRef<{
	users: UserService.User[];
	total: number;
	page: number;
	limit: number;
}>("UserPaginatedResponse");

UserPaginatedResponse.implement({
	fields: (t) => ({
		users: t.field({
			type: [User],
			resolve: (parent) => parent.users,
			description: "The users"
		}),
		total: t.exposeInt("total", {
			description: "The total number of users"
		}),
		page: t.exposeInt("page", {
			description: "Current page number"
		}),
		limit: t.exposeInt("limit", {
			description: "The number of users per page"
		})
	}),
	description: "The paginated user response object."
});
type UserPaginatedResponse = typeof UserPaginatedResponse.$inferType;

export { UserLoginResponse, User, Social, ReferralCode, UserPaginatedResponse };
