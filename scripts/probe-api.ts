import "dotenv/config";

const token = process.env["X-API-KEY"]?.trim();
if (!token) {
  console.error("No X-API-KEY");
  process.exit(1);
}

const urls = [
  "https://letsupgrade-admin-client-q6eh6ut7o-lu-labs.vercel.app/api/v1/modules?limit=1",
];

for (const url of urls) {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    const preview = text.slice(0, 120).replace(/\n/g, " ");
    console.log(`\n${url}`);
    console.log(`  status: ${res.status}`);
    console.log(`  content-type: ${res.headers.get("content-type")}`);
    console.log(`  body: ${preview}`);
  } catch (e) {
    console.log(`\n${url}`);
    console.log(`  error: ${(e as Error).message}`);
  }
}
