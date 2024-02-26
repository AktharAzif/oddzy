import { Connection } from "@solana/web3.js";
import { ethers } from "ethers";

const { POLYGON_RPC_URL, POLYGON_ZKEVM_RPC_URL, BASE_RPC_URL, SOLANA_RPC_URL } = Bun.env;

if (!POLYGON_RPC_URL || !POLYGON_ZKEVM_RPC_URL || !BASE_RPC_URL || !SOLANA_RPC_URL) {
	throw new Error("Missing RPC_URL environment variables.");
}

const providers = {
	polygon: new ethers.JsonRpcProvider(process.env.POLYGON_RPC_URL),
	polygon_zkevm: new ethers.JsonRpcProvider(process.env.POLYGON_ZKEVM_RPC_URL),
	base: new ethers.JsonRpcProvider(process.env.BASE_RPC_URL),
	solana: new Connection(SOLANA_RPC_URL, "confirmed")
};

export default providers;
