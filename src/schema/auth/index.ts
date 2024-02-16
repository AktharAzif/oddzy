import { builder } from "../../config";
import { AuthService } from "../../service";

const LoginResponse = builder.objectRef<{ jwt: string }>("LoginResponse").implement({
	fields: (t) => ({
		jwt: t.exposeString("jwt")
	})
});

builder.mutationField("adminLogin", (t) =>
	t.field({
		type: LoginResponse,
		args: {
			username: t.arg.string({ required: true }),
			password: t.arg.string({ required: true })
		},

		resolve: async (_, { username, password }) => await AuthService.adminLogin(username, password)
	})
);
