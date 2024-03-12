import { z } from "zod";

const SampleQuestion = z.object({
	question: z.string(),
	options: z.array(z.string()).length(2)
});

const CreateAutomatedPayload = z
	.object({
		id: z.string().nullish(),
		name: z.string(),
		data: z.string(),
		dataPoint: z.string(),
		description: z.string(),
		enabled: z.boolean(),
		runAt: z.date(),
		sampleQuestion: z.array(SampleQuestion)
	})
	.refine(
		(payload) => {
			try {
				const data = JSON.parse(payload.data);
				const dataPoint = JSON.parse(payload.dataPoint);
				if (!Array.isArray(data)) return false;
				if (!data.length) return false;

				for (const key in data[0]) {
					if (!dataPoint.hasOwnProperty(key)) return false;
					if (!(dataPoint[key] === true || dataPoint[key] === false)) return false;
				}
				
				return true;
			} catch {
				return false;
			}
		},
		{
			message: "data and dataPoint should be valid JSON. data should be an array and dataPoint should contain boolean values for each key in data"
		}
	);

type CreateAutomatedPayload = z.infer<typeof CreateAutomatedPayload>;

export { CreateAutomatedPayload };
