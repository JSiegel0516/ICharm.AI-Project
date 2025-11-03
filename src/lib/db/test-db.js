require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");

console.log("DATABASE_URL:", process.env.POSTGRES_URL);

const sql = postgres(process.env.POSTGRES_URL);

sql`SELECT 1 as test`
  .then((result) => {
    console.log("✅ Connection successful:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Connection failed:", error);
    process.exit(1);
  });
