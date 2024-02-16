import { builder } from "../../config";
import { WalletService } from "../../service";

const TokenEnum = builder.enumType("TokenEnum", {
	values: WalletService.Token
});

const ChainEnum = builder.enumType("ChainEnum", {
	values: WalletService.Chain
});

type TokenEnum = typeof TokenEnum.$inferType;
type ChainEnum = typeof ChainEnum.$inferType;

export { ChainEnum, TokenEnum };
