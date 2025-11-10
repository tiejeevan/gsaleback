// Script to add indexes for user search optimization
const pool = require('../db');

async function addSearchIndexes() {
  try {
    console.log('🔍 Adding search indexes for users table...\n');

    // Check if indexes already exist
    const existingIndexes = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND schemaname = 'public';
    `);

    console.log('📊 Existing indexes:');
    existingIndexes.rows.forEach(idx => console.log(`  • ${idx.indexname}`));

    // Add index for username search (case-insensitive)
    console.log('\n📝 Creating username search index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username_search 
      ON users (LOWER(username) text_pattern_ops);
    `);
    console.log('✅ Username search index created');

    // Add index for display_name search (case-insensitive)
    console.log('\n📝 Creating display_name search index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_display_name_search 
      ON users (LOWER(display_name) text_pattern_ops);
    `);
    console.log('✅ Display name search index created');

    // Add index for first_name search (case-insensitive)
    console.log('\n📝 Creating first_name search index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_first_name_search 
      ON users (LOWER(first_name) text_pattern_ops);
    `);
    console.log('✅ First name search index created');

    // Add index for last_name search (case-insensitive)
    console.log('\n📝 Creating last_name search index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_name_search 
      ON users (LOWER(last_name) text_pattern_ops);
    `);
    console.log('✅ Last name search index created');

    // Add composite index for active users
    console.log('\n📝 Creating active users index...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_users_active 
      ON users (is_active, deleted_at) 
      WHERE is_active = true AND deleted_at IS NULL;
    `);
    console.log('✅ Active users index created');

    console.log('\n✅ All search indexes created successfully!');
    console.log('\n💡 These indexes will improve search performance for user queries.');

  } catch (err) {
    console.error('❌ Error adding indexes:', err.message);
  } finally {
    await pool.end();
  }
}

addSearchIndexes();
