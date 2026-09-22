import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Works from source and dist/src/config without relying on the working directory.
const root = import.meta.url.includes("/dist/") ? "../../../../../.env" : "../../../../.env";
config({ path: fileURLToPath(new URL(root, import.meta.url)) });
