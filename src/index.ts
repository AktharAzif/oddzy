import { useDisableIntrospection } from "@graphql-yoga/plugin-disable-introspection";
import { createYoga } from "graphql-yoga";
import { AuthMiddleware } from "./middleware";
import builder from "./schema";

const PORT = Bun.env.PORT || 3000;

const yoga = createYoga({
	schema: builder.toSchema(),
	landingPage: false,
	graphiql: Bun.env.ENV !== "production",
	plugins: [
		useDisableIntrospection({
			isDisabled: () => Bun.env.ENV === "production"
		})
	],
	context: async ({ request }) => ({
		admin: await AuthMiddleware.isAdmin(request),
		user: await AuthMiddleware.isAuth(request)
	}),
	maskedErrors: false
});

const server = Bun.serve({
	fetch: yoga,
	port: PORT
});

console.info(`Server is running on ${new URL(yoga.graphqlEndpoint, server.url)}`);

//TODO: Refactor Notification & Points to a function
//TODO: Update doc for investedAndCurrentAmount bets and everywhere notification and points are used
