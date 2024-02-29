import * as jose from "jose";
import { AdminService, UserService } from "../service";

/**
 * This function validates the authorization header in the request.
 * It retrieves the "authorization" header from the request, and if it exists, it returns the token part of the header.
 * If the "authorization" header does not exist, it returns false.
 *
 * @function validateAuthorizationHeader
 * @param {Request} req - The request object from which the "authorization" header is to be retrieved.
 * @returns {string | false} - Returns the token part of the "authorization" header if it exists, otherwise it returns false.
 */
const validateAuthorizationHeader = (req: Request): string | false => {
	const auth = req.headers.get("authorization");
	if (!auth) return false;
	return auth.split(" ")[1];
};

/**
 * This function checks if the user is authenticated.
 * It retrieves the "authorization" header from the request, validates it and if it exists, it verifies the JWT token.
 * If the token is valid, it retrieves the user ID from the token payload and returns the user object.
 * If the token is not valid or does not exist, it returns false or null respectively.
 *
 * @async
 * @function isAuth
 * @param {Request} req - The request object from which the "authorization" header is to be retrieved.
 * @returns {Promise<UserService.User | false | null>} - Returns a promise that resolves to a User object if the token is valid, false if the token does not exist, or null if the token is invalid.
 */
const isAuth = async (req: Request): Promise<UserService.User | false | null> => {
	const token = validateAuthorizationHeader(req);
	if (!token) return false;
	try {
		const { payload } = await jose.jwtVerify(token, UserService.userJwtSecret);
		const userId = payload.sub as string;
		return await UserService.getUser(userId);
	} catch {
		return null;
	}
};

/**
 * This function checks if the user is an admin.
 * It retrieves the "authorization" header from the request, validates it and if it exists, it verifies the JWT token using the admin secret.
 * If the token is valid, it returns true.
 * If the token is not valid or does not exist, it returns false.
 *
 * @async
 * @function isAdmin
 * @param {Request} req - The request object from which the "authorization" header is to be retrieved.
 * @returns {Promise<boolean>} - Returns a promise that resolves to true if the token is valid, false if the token does not exist or is invalid.
 */
const isAdmin = async (req: Request): Promise<boolean> => {
	const token = validateAuthorizationHeader(req);
	if (!token) return false;
	try {
		await jose.jwtVerify(token, AdminService.adminSecret);
		return true;
	} catch {
		return false;
	}
};

export { isAuth, isAdmin };
