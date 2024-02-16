import { builder } from "../../config";
import { EventService } from "../../service";

const Category = builder.objectRef<EventService.Category>("Category").implement({
	fields: (t) => ({
		id: t.exposeInt("id"),
		name: t.exposeString("name"),
		description: t.exposeString("description", { nullable: true }),
		imageUrl: t.exposeString("image_url", { nullable: true }),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

const Source = builder.objectRef<EventService.Source>("Source").implement({
	fields: (t) => ({
		id: t.exposeInt("id"),
		name: t.exposeString("name"),
		url: t.exposeString("url"),
		eventId: t.exposeString("event_id"),
		createdAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.created_at
		}),
		updatedAt: t.field({
			authScopes: { admin: true },
			type: "Date",
			resolve: (parent) => parent.updated_at
		})
	})
});

export { Category, Source };
