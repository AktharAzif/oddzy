import { builder } from "../../config";
import { WalletService } from "../../service";

const TokenEnum = builder.enumType("TokenEnum", {
	values: WalletService.Token.options
});

const ChainEnum = builder.enumType("ChainEnum", {
	values: WalletService.Chain.options
});

export { ChainEnum, TokenEnum };
