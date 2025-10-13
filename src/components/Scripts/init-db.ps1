# scripts/init-db.ps1 - Windows PowerShell database initialization

$ErrorActionPreference = "Stop"

Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║   PostgreSQL Database Initialization  ║" -ForegroundColor Blue
Write-Host "╚════════════════════════════════════════╝`n" -ForegroundColor Blue

# Configuration
$DB_NAME = "icharm_chat"
$DB_USER = "icharm_user"
$DB_PASSWORD = "2u3hg4kjhjk%%^^THG#jhjklh"
$DB_HOST = "localhost"
$DB_PORT = "5432"

Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "   Database: $DB_NAME"
Write-Host "   User: $DB_USER"
Write-Host "   Host: $DB_HOST"
Write-Host "   Port: $DB_PORT`n"

# Check if psql is installed
if (-not (Get-Command psql -ErrorAction SilentlyContinue)) {
    Write-Host "❌ psql is not installed!" -ForegroundColor Red
    Write-Host "Please install PostgreSQL from postgresql.org" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ psql found`n" -ForegroundColor Green

# Set password environment variable
$env:PGPASSWORD = $DB_PASSWORD

# Step 1: Create database and user
Write-Host "📦 Step 1: Creating database and user..." -ForegroundColor Blue

$createDbScript = @"
DO `$`$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
        CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
`$`$;

SELECT 'CREATE DATABASE $DB_NAME'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
"@

$createDbScript | psql -h $DB_HOST -p $DB_PORT -U postgres postgres

Write-Host "✅ Database and user created`n" -ForegroundColor Green

# Step 2: Create schema
Write-Host "📋 Step 2: Creating tables and schema..." -ForegroundColor Blue

$schemaScript = @"
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS `$`$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
`$`$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

INSERT INTO users (email) VALUES ('test@example.com')
ON CONFLICT (email) DO NOTHING;
"@

$schemaScript | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME

Write-Host "✅ Schema created successfully`n" -ForegroundColor Green

# Step 3: Verify
Write-Host "🔍 Step 3: Verifying database setup...`n" -ForegroundColor Blue

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -c "\dt"

Write-Host "`n╔════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║          ✅ Setup Complete!            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "📝 Connection details for .env.local:" -ForegroundColor Blue
Write-Host "`nPOSTGRES_URL=`"postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME`"`n"
Write-Host "💡 Copy this to your .env.local file" -ForegroundColor Yellow