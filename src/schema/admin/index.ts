import { builder } from "../../config";
import { AdminService } from "../../service";
import { CreateAutomatedPayload } from "./input.ts";
import { Automation, AutomationPaginatedResponse, LoginResponse, SampleQuestion } from "./object";

builder.mutationField("adminLogin", (t) =>
	t.field({
		type: LoginResponse,
		args: {
			username: t.arg.string({ required: true, description: "The username of the admin user" }),
			password: t.arg.string({ required: true, description: "The password of the admin user" })
		},
		resolve: async (_, { username, password }) => await AdminService.adminLogin(username, password),
		description: "Login as an admin user"
	})
);

builder.mutationField("createAutomation", (t) =>
	t.field({
		type: Automation,
		authScopes: { admin: true },
		args: {
			id: t.arg.string({
				description: "The unique identifier of the automation task. Pass this field to update an existing automation task"
			}),
			name: t.arg.string({ required: true, description: "The name of the automation task" }),
			data: t.arg.string({ required: true, description: "The data of the automation task in JSON format" }),
			dataPoint: t.arg.string({ required: true, description: "The data point of the automation task in JSON format" }),
			description: t.arg.string({ required: true, description: "The description of the automation task" }),
			enabled: t.arg.boolean({ required: true, description: "The status of the automation task" }),
			runAt: t.arg({
				type: "Date",
				required: true,
				description: "The time the automation task should run"
			}),
			sampleQuestion: t.arg({
				type: [SampleQuestion],
				required: true,
				description: "The sample questions of the automation task"
			})
		},
		validate: {
			schema: CreateAutomatedPayload
		},
		resolve: async (_, args) => await AdminService.createOrUpdateAutomation(args),
		description: "Create or update an automation task"
	})
);

builder.mutationField("deleteAutomation", (t) =>
	t.field({
		type: Automation,
		authScopes: { admin: true },
		args: {
			id: t.arg.string({ required: true, description: "The unique identifier of the automation task" })
		},
		resolve: async (_, { id }) => await AdminService.deleteAutomation(id),
		description: "Delete an automation task"
	})
);

builder.queryField("automation", (t) =>
	t.field({
		type: Automation,
		authScopes: { admin: true },
		args: {
			id: t.arg.string({ required: true, description: "The unique identifier of the automation task" })
		},
		resolve: async (_, { id }) => await AdminService.getAutomation(id),
		description: "Get an automation task"
	})
);

builder.queryField("automations", (t) =>
	t.field({
		type: AutomationPaginatedResponse,
		authScopes: { admin: true },
		args: {
			page: t.arg.int({
				required: true,
				validate: { min: 1 },
				defaultValue: 1,
				description: "The page number. Min 1."
			}),
			limit: t.arg.int({
				required: true,
				validate: { min: 1, max: 100 },
				defaultValue: 20,
				description: "The number of automation tasks per page. Min 1, Max 100."
			})
		},
		resolve: async (_, { page, limit }) => await AdminService.getAutomations(page, limit),
		description: "Get all automation tasks"
	})
);

export { CreateAutomatedPayload, AutomationPaginatedResponse };
