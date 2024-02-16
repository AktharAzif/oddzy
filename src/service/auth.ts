import * as jose from "jose";
import { ErrorUtil } from "../util";

const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_JWT_SECRET } = process.env;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
	throw new Error("Environment variables ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET must be set");
}

const adminSecret = new TextEncoder().encode(ADMIN_JWT_SECRET);

const adminLogin = async (username: string, password: string) => {
	if (username.toLowerCase() !== ADMIN_USERNAME.toLowerCase() || password !== ADMIN_PASSWORD)
		throw new ErrorUtil.HttpException(401, "Invalid username or password");

	const jwt = await new jose.SignJWT({}).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(adminSecret);
	return {
		jwt
	};
};

export { adminLogin, adminSecret };
