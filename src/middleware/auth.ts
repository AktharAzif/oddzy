import * as jose from "jose";
import { AuthService, UserService } from "../service";

const validateAuthorizationHeader = (req: Request) => {
	const auth = req.headers.get("authorization");
	if (!auth) return false;
	return auth.split(" ")[1];
};

const isAuth = async (req: Request) => {
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

const isAdmin = async (req: Request) => {
	const token = validateAuthorizationHeader(req);
	if (!token) return false;
	try {
		await jose.jwtVerify(token, AuthService.adminSecret);
		return true;
	} catch {
		return false;
	}
};

export { isAuth, isAdmin };
