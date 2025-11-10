const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');

// All routes require admin access
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all tables with row counts
router.get('/tables', async (req, res) => {
    try {
        const tablesResult = await pool.query(`
            SELECT 
                table_name,
                (SELECT COUNT(*) FROM information_schema.columns 
                 WHERE table_name = t.table_name AND table_schema = 'public') as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);

        const tablesWithCounts = await Promise.all(
            tablesResult.rows.map(async (table) => {
                try {
                    const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${table.table_name}`);
                    return {
                        name: table.table_name,
                        columnCount: parseInt(table.column_count),
                        rowCount: parseInt(countResult.rows[0].count)
                    };
                } catch (err) {
                    return {
                        name: table.table_name,
                        columnCount: parseInt(table.column_count),
                        rowCount: 0,
                        error: 'Could not fetch count'
                    };
                }
            })
        );

        res.json({ tables: tablesWithCounts });
    } catch (err) {
        console.error('Error fetching tables:', err);
        res.status(500).json({ error: 'Failed to fetch tables' });
    }
});

// Get table structure (columns)
router.get('/tables/:tableName/structure', async (req, res) => {
    try {
        const { tableName } = req.params;

        const columnsResult = await pool.query(`
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length
            FROM information_schema.columns 
            WHERE table_name = $1 AND table_schema = 'public'
            ORDER BY ordinal_position;
        `, [tableName]);

        if (columnsResult.rows.length === 0) {
            return res.status(404).json({ error: 'Table not found' });
        }

        res.json({ 
            tableName,
            columns: columnsResult.rows 
        });
    } catch (err) {
        console.error('Error fetching table structure:', err);
        res.status(500).json({ error: 'Failed to fetch table structure' });
    }
});

// Get table data with pagination
router.get('/tables/:tableName/data', async (req, res) => {
    try {
        const { tableName } = req.params;
        const page = parseInt(req.query.page) || 0;
        const pageSize = parseInt(req.query.pageSize) || 100;
        const offset = page * pageSize;

        // Verify table exists
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            );
        `, [tableName]);

        if (!tableCheck.rows[0].exists) {
            return res.status(404).json({ error: 'Table not found' });
        }

        // Get total count
        const countResult = await pool.query(`SELECT COUNT(*) as count FROM ${tableName}`);
        const totalRows = parseInt(countResult.rows[0].count);

        // Get data
        const dataResult = await pool.query(
            `SELECT * FROM ${tableName} ORDER BY 1 DESC LIMIT $1 OFFSET $2`,
            [pageSize, offset]
        );

        res.json({
            tableName,
            data: dataResult.rows,
            pagination: {
                page,
                pageSize,
                totalRows,
                totalPages: Math.ceil(totalRows / pageSize)
            }
        });
    } catch (err) {
        console.error('Error fetching table data:', err);
        res.status(500).json({ error: 'Failed to fetch table data' });
    }
});

// Get database statistics
router.get('/stats', async (req, res) => {
    try {
        const tablesResult = await pool.query(`
            SELECT COUNT(*) as table_count
            FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
        `);

        const viewsResult = await pool.query(`
            SELECT COUNT(*) as view_count
            FROM information_schema.views 
            WHERE table_schema = 'public';
        `);

        const sizeResult = await pool.query(`
            SELECT pg_size_pretty(pg_database_size(current_database())) as database_size;
        `);

        res.json({
            tableCount: parseInt(tablesResult.rows[0].table_count),
            viewCount: parseInt(viewsResult.rows[0].view_count),
            databaseSize: sizeResult.rows[0].database_size
        });
    } catch (err) {
        console.error('Error fetching database stats:', err);
        res.status(500).json({ error: 'Failed to fetch database stats' });
    }
});

module.exports = router;
