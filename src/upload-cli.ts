import "dotenv/config";
import { uploadFileFromPath } from "./upload.js";

const filePath = process.argv[2];
const resource = process.argv[3] ?? "modules";

if (!filePath) {
  console.log(`
Usage: npx tsx src/upload-cli.ts <file-path> [resource]

  resource: modules (default) | contents

Example:
  npx tsx src/upload-cli.ts ./cover.png modules
`);
  process.exit(1);
}

try {
  const { url } = await uploadFileFromPath(filePath, resource);
  console.log(url);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
