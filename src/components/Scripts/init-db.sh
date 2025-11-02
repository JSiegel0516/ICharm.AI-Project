#!/bin/bash

# scripts/init-db-windows.sh - Windows-compatible database initialization

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   PostgreSQL Database Initialization  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Configuration
DB_NAME="icharm_chat"
DB_USER="icharm_user"
DB_PASSWORD="2u3hg4kjhjk%%^^THG#jhjklh"
DB_HOST="localhost"
DB_PORT="5432"
POSTGRES_USER="postgres"

echo -e "${YELLOW}📋 Configuration:${NC}"
echo "   Database: $DB_NAME"
echo "   User: $DB_USER"
echo "   Host: $DB_HOST"
echo "   Port: $DB_PORT"
echo ""

# Check psql
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ psql not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ psql found${NC}"

# Check PostgreSQL is running
if ! pg_isready -h $DB_HOST -p $DB_PORT &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✅ PostgreSQL is running${NC}\n"

# Prompt for postgres password
echo -e "${YELLOW}Enter your PostgreSQL 'postgres' user password:${NC}"
read -s POSTGRES_PASSWORD
echo ""

export PGPASSWORD=$POSTGRES_PASSWORD

# Step 1: Create database and user
echo -e "${BLUE}📦 Step 1: Creating database and user...${NC}"

psql -h $DB_HOST -p $DB_PORT -U $POSTGRES_USER postgres <<-EOSQL
    -- Create user if not exists
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_user WHERE usename = '$DB_USER') THEN
            CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';
        END IF;
    END
    \$\$;

    -- Create database if not exists
    SELECT 'CREATE DATABASE $DB_NAME'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

    -- Grant privileges
    GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOSQL

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create database and user${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Database and user created${NC}\n"

# Step 2: Create schema
echo -e "${BLUE}📋 Step 2: Creating tables and schema...${NC}"

export PGPASSWORD=$DB_PASSWORD

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<-'EOSQL'
    -- Drop existing tables
    DROP TABLE IF EXISTS chat_messages CASCADE;
    DROP TABLE IF EXISTS chat_sessions CASCADE;
    DROP TABLE IF EXISTS users CASCADE;

    -- Create users table
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create chat_sessions table
    CREATE TABLE chat_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create chat_messages table
    CREATE TABLE chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL CHECK (role IN ('system', 'user', 'assistant')),
      content TEXT NOT NULL,
      sources JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX idx_chat_sessions_user_id ON chat_sessions(user_id);
    CREATE INDEX idx_chat_sessions_updated_at ON chat_sessions(updated_at DESC);
    CREATE INDEX idx_chat_messages_session_id ON chat_messages(session_id);
    CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at);

    -- Create trigger function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    -- Create triggers
    CREATE TRIGGER update_users_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    CREATE TRIGGER update_chat_sessions_updated_at
      BEFORE UPDATE ON chat_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();

    -- Insert test user
    INSERT INTO users (email) VALUES ('test@example.com')
    ON CONFLICT (email) DO NOTHING;
EOSQL

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to create schema${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Schema created successfully${NC}\n"

# Step 3: Verify
echo -e "${BLUE}🔍 Step 3: Verifying setup...${NC}\n"

export PGPASSWORD=$DB_PASSWORD

psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME <<-'EOSQL'
    \echo '📊 Tables:'
    \dt
    \echo ''
    \echo '📈 Row counts:'
    SELECT 'users' as table_name, COUNT(*) as count FROM users
    UNION ALL
    SELECT 'chat_sessions', COUNT(*) FROM chat_sessions
    UNION ALL
    SELECT 'chat_messages', COUNT(*) FROM chat_messages;
EOSQL

echo ""
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Setup Complete!            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

echo -e "${BLUE}📝 Add this to your .env.local:${NC}"
echo ""
echo "POSTGRES_URL=\"postgres://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME\""
echo ""
