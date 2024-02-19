import { builder } from "../../config";
import { EventService } from "../../service";

const EventStatusEnum = builder.enumType("EventStatusEnum", {
	values: EventService.EventStatus.options
});

const BetTypeEnum = builder.enumType("BetTypeEnum", {
	values: EventService.BetType.options
});

export { BetTypeEnum, EventStatusEnum };
