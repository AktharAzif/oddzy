import { builder } from "../../config";
import { EventService } from "../../service";

const EventStatusEnum = builder.enumType("EventStatusEnum", {
	values: EventService.EventStatus
});

type EventStatusEnum = typeof EventStatusEnum.$inferType;

export { EventStatusEnum };
