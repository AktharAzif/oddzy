import { ChatOpenAI } from "@langchain/openai";
import { createId } from "@paralleldrive/cuid2";
import * as jose from "jose";
import { z } from "zod";
import { db } from "../config";
import { AdminSchema } from "../schema";
import { ErrorUtil } from "../util";

const chatModel = new ChatOpenAI({
	modelName: "gpt-4"
});

const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_JWT_SECRET } = process.env;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !ADMIN_JWT_SECRET) {
	throw new Error("Environment variables ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_JWT_SECRET must be set");
}

const adminSecret = new TextEncoder().encode(ADMIN_JWT_SECRET);

const Automation = z.object({
	id: z.string(),
	name: z.string(),
	data: z.string(),
	dataPoint: z.string(),
	description: z.string(),
	enabled: z.boolean(),
	sampleQuestion: z.string(),
	runAt: z.date(),
	lastRanAt: z.date().nullable(),
	createdAt: z.date(),
	updatedAt: z.date()
});
type Automation = z.infer<typeof Automation>;

/**
 * This function is used for admin login. It takes username and password as parameters.
 * If the username and password match the ones stored in environment variables, it generates a JWT token.
 * If the username or password do not match, it throws an HTTP 401 error.
 *
 * @param {string} username - The username provided by the user.
 * @param {string} password - The password provided by the user.
 * @returns {Promise<{jwt: string}>} - Returns a promise that resolves to an object containing the JWT token.
 * @throws {ErrorUtil.HttpException} - Throws an HTTP 401 error if the username or password do not match the ones stored in environment variables.
 */
const adminLogin = async (username: string, password: string): Promise<{ jwt: string }> => {
	if (username.toLowerCase() !== ADMIN_USERNAME.toLowerCase() || password !== ADMIN_PASSWORD) throw new ErrorUtil.HttpException(401, "Invalid username or password");

	const jwt = await new jose.SignJWT({}).setProtectedHeader({ alg: "HS256" }).sign(adminSecret);
	return {
		jwt
	};
};

/**
 * This function is used to create or update an automation task. It takes a payload as a parameter.
 * If the payload contains an id, it updates the existing automation task with the new data from the payload.
 * If the payload does not contain an id, it creates a new automation task with the data from the payload.
 * The function returns the created or updated automation task.
 *
 * @param {AdminSchema.CreateAutomatedPayload} payload - The payload containing the data for the automation task.
 * @returns {Promise<Automation>} - Returns a promise that resolves to the created or updated automation task.
 * @throws {ErrorUtil.HttpException} - Throws an HTTP 404 error if an update is attempted on a non-existing automation task.
 */
const createOrUpdateAutomation = async (payload: AdminSchema.CreateAutomatedPayload): Promise<Automation> => {
	const sampleQuestion = JSON.stringify(payload.sampleQuestion);

	if (payload.id) {
		const { id, ...rest } = payload;
		const [res] = await db.sql`UPDATE "admin".automation
                               SET ${db.sql({ ...rest, sampleQuestion, updatedAt: new Date() })}
                               WHERE id = ${id}
                               RETURNING *`;

		if (!res) throw new ErrorUtil.HttpException(404, "Automation task not found");
		return Automation.parse(res);
	}

	return Automation.parse(
		(
			await db.sql`INSERT INTO "admin".automation ${db.sql({
				...payload,
				sampleQuestion,
				id: createId()
			})} RETURNING *`
		)[0]
	);
};

/**
 * This function is used to delete an automation task. It takes an id as a parameter.
 * If an automation task with the provided id exists, it deletes the task and returns the deleted task.
 * If an automation task with the provided id does not exist, it throws an HTTP 404 error.
 *
 * @param {string} id - The id of the automation task to be deleted.
 * @returns {Promise<Automation>} - Returns a promise that resolves to the deleted automation task.
 * @throws {ErrorUtil.HttpException} - Throws an HTTP 404 error if an automation task with the provided id does not exist.
 */
const deleteAutomation = async (id: string): Promise<Automation> => {
	const [res] = await db.sql`DELETE
                             FROM "admin".automation
                             WHERE id = ${id}
                             RETURNING *`;

	if (!res) throw new ErrorUtil.HttpException(404, "Automation task not found");

	return Automation.parse(res);
};

/**
 * This function is used to retrieve an automation task. It takes an id as a parameter.
 * If an automation task with the provided id exists, it returns the task.
 * If an automation task with the provided id does not exist, it throws an HTTP 404 error.
 *
 * @param {string} id - The id of the automation task to be retrieved.
 * @returns {Promise<Automation>} - Returns a promise that resolves to the retrieved automation task.
 * @throws {ErrorUtil.HttpException} - Throws an HTTP 404 error if an automation task with the provided id does not exist.
 */
const getAutomation = async (id: string): Promise<Automation> => {
	const [res] = await db.sql`SELECT *
                             FROM "admin".automation
                             WHERE id = ${id}`;
	if (!res) throw new ErrorUtil.HttpException(404, "Automation task not found");
	return Automation.parse(res);
};

/**
 * This function is used to retrieve a paginated list of automation tasks. It takes a page number and a limit as parameters.
 * The function queries the "admin".automation table in the database and retrieves a list of automation tasks.
 * The list is ordered by the creation date in descending order and is limited by the provided limit and offset by the product of the page number and the limit.
 * The function also retrieves the total number of automation tasks.
 * The function returns an object containing the list of retrieved automation tasks, the total number of automation tasks, the current page number, and the limit.
 *
 * @param {number} page - The page number for the list of automation tasks to be retrieved.
 * @param {number} limit - The limit for the number of automation tasks to be retrieved.
 * @returns {Promise<AdminSchema.AutomationPaginatedResponse>} - Returns a promise that resolves to an object containing the list of retrieved automation tasks, the total number of automation tasks, the current page number, and the limit.
 */
const getAutomations = async (page: number, limit: number): Promise<AdminSchema.AutomationPaginatedResponse> => {
	const automations = db.sql`SELECT *
                             FROM "admin".automation
                             ORDER BY created_at DESC
                             OFFSET ${page * limit} LIMIT ${limit}`;

	const total = db.sql`SELECT COUNT(*)
                       FROM "admin".automation` as Promise<[{ count: string }]>;

	const [data, [{ count }]] = await Promise.all([automations, total]);

	return {
		automations: z.array(Automation).parse(data),
		total: Number(count),
		page: page + 1,
		limit
	};
};

const runAutomation = async (id: string): Promise<void> => {
	const automation = await getAutomation(id);
	const data = JSON.parse(automation.data);
	const dataPoint = JSON.parse(automation.dataPoint);

	const filteredDataArr = data.map((obj: any) => {
		const newObj: any = {};
		for (const key in dataPoint) {
			if (dataPoint[key]) newObj[key] = obj[key];
		}
		return newObj;
	});

	const prompt = `You are a bot designed to generate questions for a prediction market based on the provided data.
		The data will include game descriptions, data points, and sample questions. Your task is to generate questions and two options for each question.
		Your questions should not closely resemble the sample questions; instead, aim for creativity in generating them. While similar questions can be included, diversity is encouraged for better engagement.
		Aim to produce as many questions as possible, ensuring they are suitable for prediction markets.
		Avoid questions whose answers are already evident in the data or publicly known at the time of question generation. Focus on asking about future events or unknown factors.
		If description or sample questions are not provided, try to generate questions based on the data.
		If you cannot generate questions, please respond with an empty array.
		Your response should be in the following format:
		{{
			question: string,
			options: [string, string]
		}}
		
		Data:
		${JSON.stringify(filteredDataArr)}
		
		Description:
		${automation.description}
		
		Sample Questions:
		${automation.sampleQuestion}
		
		Questions:`;

	const res = await chatModel.invoke(prompt);

	const questions = JSON.parse(res.content.toString());

	console.log(questions);
};

const automationTask = async () => {
	const automations = await db.sql`SELECT *
                                   FROM "admin".automation
                                   WHERE enabled = TRUE
                                     AND run_at::TIME < NOW()::TIME
                                     AND (last_ran_at IS NULL OR last_ran_at < NOW())`;

	for (const automation of automations) {
		await runAutomation(automation.id);
	}
};

export { adminLogin, adminSecret, Automation, createOrUpdateAutomation, deleteAutomation, getAutomation, getAutomations };
