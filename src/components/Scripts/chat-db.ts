// scripts/chat-db.ts
import { config } from "dotenv";
import { Client } from "pg";

// Load .env.local
config({ path: ".env.local" });

async function testConnection() {
  console.log("🔌 Testing PostgreSQL connection...\n");

  if (!process.env.POSTGRES_URL) {
    console.error("❌ POSTGRES_URL not found in environment variables");
    process.exit(1);
  }

  console.log("POSTGRES_URL loaded\n");

  const client = new Client({
    connectionString: process.env.POSTGRES_URL,
  });

  try {
    await client.connect();
  } catch (connectError) {
    console.error("�?O Connection failed before queries could run!");
    console.error("Error:", connectError);
    process.exit(1);
  }

  try {
    // Test basic connection
    const result = await client.query(
      "SELECT NOW() as current_time, version() as version",
    );

    console.log("Connection successful!");
    console.log("📅 Server time:", result.rows[0].current_time);
    console.log("📦 PostgreSQL version:", result.rows[0].version.split(",")[0]);
    console.log();

    // List tables
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log("📋 Tables found:");
    tables.rows.forEach((row) => {
      console.log(`   ✓ ${row.table_name}`);
    });
    console.log();

    // Check row counts
    const userCount = await client.query("SELECT COUNT(*) as count FROM users");
    const sessionCount = await client.query(
      "SELECT COUNT(*) as count FROM chat_sessions",
    );
    const messageCount = await client.query(
      "SELECT COUNT(*) as count FROM chat_messages",
    );

    console.log("📊 Current data:");
    console.log(`   Users: ${userCount.rows[0].count}`);
    console.log(`   Sessions: ${sessionCount.rows[0].count}`);
    console.log(`   Messages: ${messageCount.rows[0].count}`);
    console.log();

    // Test insert and delete
    console.log("🧪 Testing insert operation...");

    const testUser = await client.query(
      "INSERT INTO users (email) VALUES ('test-connection@example.com') RETURNING id, email",
    );

    console.log("   ✓ Insert successful:", testUser.rows[0].email);

    // Clean up
    await client.query(
      "DELETE FROM users WHERE email = 'test-connection@example.com'",
    );
    console.log("   ✓ Cleanup successful");
    console.log();

    console.log("🎉 All tests passed! Database is ready to use.\n");
  } catch (error) {
    console.error("❌ Connection failed!");
    console.error("Error:", error);
    console.log();
    console.log("💡 Troubleshooting:");
    console.log("   1. Check if PostgreSQL is running");
    console.log("   2. Verify POSTGRES_URL in .env.local");
    console.log("   3. Make sure the database was created");
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();
