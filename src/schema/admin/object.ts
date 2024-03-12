import { builder } from "../../config";
import { AdminService } from "../../service";

const LoginResponse = builder.objectRef<{ jwt: string }>("LoginResponse").implement({
	fields: (t) => ({
		jwt: t.exposeString("jwt", {
			description: "The JWT token for the admin user"
		})
	})
});

const SampleQuestion = builder.inputType("SampleQuestion", {
	fields: (t) => ({
		question: t.string({ required: true, description: "The question of the sample question" }),
		options: t.stringList({
			required: true,
			description: "The options of the sample question. It should be an array of length 2"
		})
	}),
	description: "The sample question of the automation task"
});

const Automation = builder.objectRef<AdminService.Automation>("Automation").implement({
	fields: (t) => ({
		id: t.exposeString("id", {
			description: "The unique identifier of the automation task"
		}),
		name: t.exposeString("name", {
			description: "The name of the automation task"
		}),
		data: t.exposeString("data", {
			description: "The data of the automation task in JSON format"
		}),
		dataPoint: t.exposeString("dataPoint", {
			description: "The data point of the automation task in JSON format"
		}),
		description: t.exposeString("description", {
			description: "The description of the automation task"
		}),
		sampleQuestion: t.exposeString("sampleQuestion", {
			description: "The sample questions of the automation task"
		}),
		enabled: t.exposeBoolean("enabled", {
			description: "The status of the automation task"
		}),
		runAt: t.field({
			type: "Date",
			resolve: (parent) => parent.runAt,
			description: "The time the automation task should run"
		}),
		lastRanAt: t.field({
			type: "Date",
			resolve: (parent) => parent.lastRanAt,
			description: "The time the automation task last ran",
			nullable: true
		}),
		createdAt: t.field({
			type: "Date",
			resolve: (parent) => parent.createdAt,
			description: "The time the automation task was created"
		}),
		updatedAt: t.field({
			type: "Date",
			resolve: (parent) => parent.updatedAt,
			description: "The time the automation task was updated"
		})
	}),
	description: "The automation task response object"
});

const AutomationPaginatedResponse = builder
	.objectRef<{
		automations: AdminService.Automation[];
		total: number;
		page: number;
		limit: number;
	}>("AutomationPaginatedResponse")
	.implement({
		fields: (t) => ({
			data: t.field({
				type: [Automation],
				resolve: (parent) => parent.automations,
				description: "The automation list"
			}),
			total: t.exposeInt("total", {
				description: "The total number of results"
			}),
			page: t.exposeInt("page", {
				description: "The current page number"
			}),
			limit: t.exposeInt("limit", {
				description: "The number of results per page"
			})
		}),
		description: "The automation paginated response object"
	});
type AutomationPaginatedResponse = typeof AutomationPaginatedResponse.$inferType;

export { LoginResponse, Automation, SampleQuestion, AutomationPaginatedResponse };
