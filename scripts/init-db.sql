-- Database initialization script for ITP System32
-- This script runs when the database container is first created

-- Create additional database users if needed
-- CREATE USER IF NOT EXISTS 'backup_user'@'%' IDENTIFIED BY 'backup_password';
-- GRANT SELECT, LOCK TABLES ON itp_system32_db.* TO 'backup_user'@'%';

-- Set up any initial database configurations
-- ALTER DATABASE itp_system32_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create any initial tables or data if needed
-- This is optional since Django will handle migrations

-- Optimize MySQL settings for production
SET GLOBAL innodb_buffer_pool_size = 256M;
SET GLOBAL max_connections = 100;
SET GLOBAL query_cache_size = 64M;
SET GLOBAL query_cache_type = 1;
