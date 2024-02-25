import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import ValidationPlugin from "@pothos/plugin-validation";
import { DateTimeResolver } from "graphql-scalars";
import { UserService } from "../service";

const builder = new SchemaBuilder<{
	Scalars: {
		Date: {
			Input: Date;
			Output: Date;
		};
	};

	AuthScopes: {
		admin: boolean;
		user: boolean;
	};

	Context: {
		admin: boolean;
		user: UserService.User | null;
	};
}>({
	plugins: [ScopeAuthPlugin, ValidationPlugin],
	authScopes: async ({ admin, user }) => ({
		admin,
		user: !!user
	})
});

builder.addScalarType("Date", DateTimeResolver);
builder.queryType({});
builder.mutationType({});

export default builder;
