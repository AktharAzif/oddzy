import * as jose from "jose";
import { AuthService } from "../service";

const isAdmin = async (req: Request) => {
	const auth = req.headers.get("authorization");
	if (!auth) return false;
	const token = auth.split(" ")[1];
	if (!token) return false;
	try {
		await jose.jwtVerify(token, AuthService.adminSecret);
		return true;
	} catch {
		return false;
	}
};

export { isAdmin };
