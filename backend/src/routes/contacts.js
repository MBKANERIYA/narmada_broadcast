import { Router } from 'express';
import { query, run, get } from '../database.js';

const router = Router();

/**
 * GET /api/v1/contacts
 */
router.get('/', async (req, res) => {
    try {
        const { search, tag, location, min_ticket, max_ticket, page = 1, limit = 50 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        let sql = 'SELECT * FROM contacts WHERE tenant_id = ?';
        const params = [req.tenantId];

        console.log(`[CONTACTS GET] tenant_id=${req.tenantId}, search=${search || ''}, page=${page}`);

        if (search) {
            sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR location LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }

        if (tag) {
            sql += ' AND JSON_CONTAINS(tags, ?)';
            params.push(JSON.stringify(tag));
        }

        if (location) {
            sql += ' AND location LIKE ?';
            params.push(`%${location}%`);
        }

        if (min_ticket) {
            sql += ' AND ticket_size >= ?';
            params.push(parseFloat(min_ticket));
        }

        if (max_ticket) {
            sql += ' AND ticket_size <= ?';
            params.push(parseFloat(max_ticket));
        }

        const limitNum = parseInt(limit) || 50;
        const offsetNum = parseInt(offset) || 0;

        // Sorting
        const allowedSorts = ['created_at', 'name', 'ticket_size', 'location'];
        const sortBy = allowedSorts.includes(req.query.sort_by) ? req.query.sort_by : 'created_at';
        const sortOrder = req.query.sort_order === 'asc' ? 'ASC' : 'DESC';

        sql += ` ORDER BY ${sortBy} ${sortOrder} LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const contacts = await query(sql, params);

        // Total count (with same filters)
        let countSql = 'SELECT COUNT(*) as total FROM contacts WHERE tenant_id = ?';
        const countParams = [req.tenantId];
        if (search) {
            countSql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR location LIKE ?)';
            const s = `%${search}%`;
            countParams.push(s, s, s, s);
        }
        if (tag) { countSql += ' AND JSON_CONTAINS(tags, ?)'; countParams.push(JSON.stringify(tag)); }
        if (location) { countSql += ' AND location LIKE ?'; countParams.push(`%${location}%`); }
        if (min_ticket) { countSql += ' AND ticket_size >= ?'; countParams.push(parseFloat(min_ticket)); }
        if (max_ticket) { countSql += ' AND ticket_size <= ?'; countParams.push(parseFloat(max_ticket)); }

        const countResult = await get(countSql, countParams);

        res.json({
            contacts,
            total: countResult?.total || 0,
            page: parseInt(page),
            limit: parseInt(limit),
        });
    } catch (error) {
        console.error('Fetch contacts error:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

/**
 * GET /api/v1/contacts/tags/list
 */
router.get('/tags/list', async (req, res) => {
    try {
        const rows = await query(
            `SELECT DISTINCT JSON_UNQUOTE(jt.tag) as tag 
             FROM contacts, JSON_TABLE(COALESCE(tags, '[]'), '$[*]' COLUMNS(tag VARCHAR(100) PATH '$')) jt
             WHERE tenant_id = ?`,
            [req.tenantId]
        );
        res.json(rows.map(r => r.tag).filter(Boolean));
    } catch (error) {
        res.json([]);
    }
});

/**
 * GET /api/v1/contacts/locations/list
 */
router.get('/locations/list', async (req, res) => {
    try {
        const rows = await query(
            'SELECT DISTINCT location FROM contacts WHERE tenant_id = ? AND location IS NOT NULL AND location != "" ORDER BY location',
            [req.tenantId]
        );
        res.json(rows.map(r => r.location));
    } catch (error) {
        res.json([]);
    }
});

/**
 * GET /api/v1/contacts/export
 * Export filtered contacts as CSV
 */
router.get('/export', async (req, res) => {
    try {
        const { search, tag, location } = req.query;
        let sql = 'SELECT * FROM contacts WHERE tenant_id = ?';
        const params = [req.tenantId];

        if (search) {
            sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR location LIKE ?)';
            const s = `%${search}%`;
            params.push(s, s, s, s);
        }
        if (tag) { sql += ' AND JSON_CONTAINS(tags, ?)'; params.push(JSON.stringify(tag)); }
        if (location) { sql += ' AND location LIKE ?'; params.push(`%${location}%`); }

        sql += ' ORDER BY created_at DESC LIMIT 10000';
        const contacts = await query(sql, params);

        const headers = ['Name', 'Phone', 'Email', 'Location', 'Ticket Size', 'Tags', 'Source', 'Notes', 'Date Added'];
        const csvRows = [headers.join(',')];
        for (const c of (contacts || [])) {
            let tags = '';
            try { tags = JSON.parse(c.tags || '[]').join(';'); } catch { }
            csvRows.push([
                `"${(c.name || '').replace(/"/g, '""')}"`,
                c.phone || '',
                c.email || '',
                `"${(c.location || '').replace(/"/g, '""')}"`,
                c.ticket_size || '',
                `"${tags}"`,
                c.source || '',
                `"${(c.notes || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
                c.created_at || '',
            ].join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=contacts-${new Date().toISOString().split('T')[0]}.csv`);
        res.send(csvRows.join('\n'));
    } catch (error) {
        console.error('Export contacts error:', error);
        res.status(500).json({ error: 'Failed to export contacts' });
    }
});

/**
 * GET /api/v1/contacts/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const contact = await get('SELECT * FROM contacts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        if (!contact) return res.status(404).json({ error: 'Contact not found' });
        res.json(contact);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

/**
 * POST /api/v1/contacts
 */
router.post('/', async (req, res) => {
    try {
        const { name, phone, email, location, ticket_size, tags, notes, source } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required' });
        if (!phone) return res.status(400).json({ error: 'Phone is required' });

        const result = await run(
            'INSERT INTO contacts (tenant_id, name, phone, email, location, ticket_size, tags, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [req.tenantId, name, phone, email || null, location || null, ticket_size || null, tags ? JSON.stringify(tags) : null, notes || null, source || null]
        );

        res.status(201).json({ id: result.lastInsertRowid, message: 'Contact created' });
    } catch (error) {
        console.error('Create contact error:', error);
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

/**
 * PUT /api/v1/contacts/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, phone, email, location, ticket_size, tags, notes, source, whatsapp_consent } = req.body;

        await run(
            `UPDATE contacts SET name = ?, phone = ?, email = ?, location = ?, ticket_size = ?, tags = ?, notes = ?, source = ?, whatsapp_consent = ? WHERE id = ? AND tenant_id = ?`,
            [name, phone, email || null, location || null, ticket_size || null, tags ? JSON.stringify(tags) : null, notes || null, source || null, whatsapp_consent !== false, req.params.id, req.tenantId]
        );

        res.json({ message: 'Contact updated' });
    } catch (error) {
        console.error('Update contact error:', error);
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

/**
 * DELETE /api/v1/contacts/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        await run('DELETE FROM contacts WHERE id = ? AND tenant_id = ?', [req.params.id, req.tenantId]);
        res.json({ message: 'Contact deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

/**
 * POST /api/v1/contacts/import
 */
router.post('/import', async (req, res) => {
    try {
        const { contacts: contactList } = req.body;
        if (!Array.isArray(contactList) || contactList.length === 0) {
            return res.status(400).json({ error: 'Provide a non-empty contacts array' });
        }

        console.log(`[IMPORT] tenant_id=${req.tenantId}, contacts=${contactList.length}`);

        let imported = 0;
        let skipped = 0;

        for (const c of contactList) {
            if (!c.name || !c.phone) { skipped++; continue; }
            try {
                const result = await run(
                    'INSERT INTO contacts (tenant_id, name, phone, email, location, ticket_size, tags, notes, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [req.tenantId, c.name, c.phone, c.email || null, c.location || null, c.ticket_size || null, c.tags ? JSON.stringify(c.tags) : null, c.notes || null, c.source || null]
                );
                console.log(`[IMPORT] Inserted ${c.name}: id=${result.lastInsertRowid}, rows=${result.changes}`);
                imported++;
            } catch (err) {
                console.error(`[IMPORT] Failed ${c.name}:`, err.message);
                skipped++;
            }
        }

        // Verify: query back
        const verify = await query('SELECT COUNT(*) as cnt FROM contacts WHERE tenant_id = ?', [req.tenantId]);
        console.log(`[IMPORT] Verify: ${verify[0]?.cnt} contacts in tenant ${req.tenantId}`);

        res.json({ imported, skipped, total: contactList.length });
    } catch (error) {
        console.error('Import contacts error:', error);
        res.status(500).json({ error: 'Failed to import contacts' });
    }
});

export default router;
