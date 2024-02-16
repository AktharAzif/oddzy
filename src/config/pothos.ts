import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import { DateTimeResolver } from "graphql-scalars";

const builder = new SchemaBuilder<{
	Scalars: {
		Date: {
			Input: Date;
			Output: Date;
		};
	};

	AuthScopes: {
		admin: boolean;
	};

	Context: {
		admin: boolean;
	};
}>({
	plugins: [ScopeAuthPlugin],
	authScopes: async ({ admin }) => ({
		admin
	})
});

builder.addScalarType("Date", DateTimeResolver);
builder.queryType({});
builder.mutationType({});

export default builder;
