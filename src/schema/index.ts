import { builder } from "../config";
import * as AdminSchema from "./admin";
import * as BetSchema from "./bet";
import * as EventSchema from "./event";
import * as UserSchema from "./user";
import * as WalletSchema from "./wallet";

export { AdminSchema, EventSchema, WalletSchema, UserSchema, BetSchema };

export default builder;
