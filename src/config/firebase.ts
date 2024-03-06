import { cert, initializeApp, type ServiceAccount } from "firebase-admin/app";
import config from "./firebase.json";

const firebase = initializeApp({
	credential: cert(config as ServiceAccount)
});
