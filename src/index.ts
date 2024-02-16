import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
import { createYoga } from "graphql-yoga";
import { AuthMiddleware } from "./middleware";
import builder from "./schema";

const PORT = Bun.env.PORT || 3000;

const yoga = createYoga({
	schema: builder.toSchema(),
	landingPage: false,
	graphiql: Bun.env.ENV !== "production" && {
		defaultQuery: "# Oddzy GraphQL Playground"
	},
	plugins: [
		useDisableIntrospection({
			isDisabled: () => (Bun.env.ENV === "production" ? true : false)
		})
	],
	context: async ({ request }) => ({
		admin: await AuthMiddleware.isAdmin(request)
	})
});

const server = Bun.serve({
	fetch: yoga,
	port: PORT
});

console.info(`Server is running on ${new URL(yoga.graphqlEndpoint, server.url)}`);
