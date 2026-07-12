const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'assetflow-hackathon-2024-secret';

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const upload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  })
});

const db = new sqlite3.Database(path.join(__dirname, 'assetflow.db'));

// Promisify helpers
const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ id: this.lastID, changes: this.changes });
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

// Initialize database
async function initDB() {
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    department_id INTEGER,
    role TEXT CHECK(role IN ('Admin', 'Asset Manager', 'Department Head', 'Employee')) DEFAULT 'Employee',
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    head_id INTEGER,
    parent_id INTEGER,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS asset_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    fields TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER,
    asset_tag TEXT UNIQUE NOT NULL,
    serial_number TEXT,
    acquisition_date TEXT,
    acquisition_cost REAL,
    condition TEXT,
    location TEXT,
    is_bookable INTEGER DEFAULT 0,
    status TEXT CHECK(status IN ('Available', 'Allocated', 'Reserved', 'Under Maintenance', 'Lost', 'Retired', 'Disposed')) DEFAULT 'Available',
    current_holder_id INTEGER,
    department_id INTEGER,
    photo_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    employee_id INTEGER,
    department_id INTEGER,
    allocated_by INTEGER,
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expected_return_date TEXT,
    returned_at DATETIME,
    return_condition TEXT,
    return_notes TEXT,
    status TEXT CHECK(status IN ('Active', 'Returned', 'Overdue')) DEFAULT 'Active'
  )`);

  await run(`CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    from_employee_id INTEGER,
    to_employee_id INTEGER,
    requested_by INTEGER,
    approved_by INTEGER,
    status TEXT CHECK(status IN ('Requested', 'Approved', 'Rejected', 'Re-allocated')) DEFAULT 'Requested',
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME
  )`);

  await run(`CREATE TABLE IF NOT EXISTS resources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT,
    location TEXT,
    capacity INTEGER,
    status TEXT CHECK(status IN ('Active', 'Inactive')) DEFAULT 'Active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    purpose TEXT,
    status TEXT CHECK(status IN ('Upcoming', 'Ongoing', 'Completed', 'Cancelled')) DEFAULT 'Upcoming',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS maintenance_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    requested_by INTEGER NOT NULL,
    issue_description TEXT NOT NULL,
    priority TEXT CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')) DEFAULT 'Medium',
    photos TEXT,
    status TEXT CHECK(status IN ('Pending', 'Approved', 'Rejected', 'Technician Assigned', 'In Progress', 'Resolved')) DEFAULT 'Pending',
    approved_by INTEGER,
    technician_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME,
    started_at DATETIME,
    resolved_at DATETIME,
    resolution_notes TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS audit_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    scope_department_id INTEGER,
    scope_location TEXT,
    start_date TEXT,
    end_date TEXT,
    status TEXT CHECK(status IN ('Open', 'In Progress', 'Closed')) DEFAULT 'Open',
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
  )`);

  await run(`CREATE TABLE IF NOT EXISTS audit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_cycle_id INTEGER NOT NULL,
    asset_id INTEGER NOT NULL,
    auditor_id INTEGER,
    status TEXT CHECK(status IN ('Pending', 'Verified', 'Missing', 'Damaged')) DEFAULT 'Pending',
    notes TEXT,
    verified_at DATETIME
  )`);

  await run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    related_id INTEGER,
    related_type TEXT,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await seedData();
}

async function seedData() {
  const admin = await get(`SELECT * FROM users WHERE email = ?`, ['admin@assetflow.com']);
  if (admin) return;

  console.log('Seeding demo data...');

  const adminHash = await bcrypt.hash('admin123', 10);
  const adminId = (await run(`INSERT INTO users (email, password, name, role, status) VALUES (?, ?, ?, ?, ?)`,
    ['admin@assetflow.com', adminHash, 'System Admin', 'Admin', 'Active'])).id;

  const engId = (await run(`INSERT INTO departments (name, status) VALUES (?, ?)`, ['Engineering', 'Active'])).id;
  const itId = (await run(`INSERT INTO departments (name, status) VALUES (?, ?)`, ['IT', 'Active'])).id;
  const facId = (await run(`INSERT INTO departments (name, status) VALUES (?, ?)`, ['Facilities', 'Active'])).id;

  const elecId = (await run(`INSERT INTO asset_categories (name, fields) VALUES (?, ?)`, ['Electronics', '{"warranty": "string"}'])).id;
  const furnId = (await run(`INSERT INTO asset_categories (name, fields) VALUES (?, ?)`, ['Furniture', '{}'])).id;
  const vehId = (await run(`INSERT INTO asset_categories (name, fields) VALUES (?, ?)`, ['Vehicles', '{}'])).id;

  const empHash = await bcrypt.hash('password123', 10);
  const priyaId = (await run(`INSERT INTO users (email, password, name, department_id, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ['priya@company.com', empHash, 'Priya Shah', engId, 'Employee', 'Active'])).id;
  const rajId = (await run(`INSERT INTO users (email, password, name, department_id, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ['raj@company.com', empHash, 'Raj Kumar', itId, 'Employee', 'Active'])).id;
  const managerId = (await run(`INSERT INTO users (email, password, name, department_id, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ['manager@company.com', empHash, 'Asset Manager', itId, 'Asset Manager', 'Active'])).id;
  const headId = (await run(`INSERT INTO users (email, password, name, department_id, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
    ['head@company.com', empHash, 'Department Head', engId, 'Department Head', 'Active'])).id;

  await run(`UPDATE departments SET head_id = ? WHERE id = ?`, [headId, engId]);

  const assets = [
    { name: 'Dell Laptop', tag: 'AF-0012', cat: elecId, status: 'Allocated', holder: priyaId, loc: 'Bangalore', cond: 'Good' },
    { name: 'Projector', tag: 'AF-0062', cat: elecId, status: 'Under Maintenance', holder: null, loc: 'HQ Floor 2', cond: 'Fair' },
    { name: 'Office Chair', tag: 'AF-0201', cat: furnId, status: 'Available', holder: null, loc: 'Warehouse', cond: 'Good' },
    { name: 'MacBook Pro', tag: 'AF-0114', cat: elecId, status: 'Allocated', holder: rajId, loc: 'IT Dept', cond: 'Excellent' },
    { name: 'Ford Transit', tag: 'AF-0301', cat: vehId, status: 'Available', holder: null, loc: 'Parking A', cond: 'Good' },
  ];

  for (const a of assets) {
    await run(`INSERT INTO assets (name, asset_tag, category_id, status, current_holder_id, location, condition, acquisition_date, acquisition_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [a.name, a.tag, a.cat, a.status, a.holder, a.loc, a.cond, '2023-01-15', 1200]);
  }

  await run(`INSERT INTO allocations (asset_id, employee_id, allocated_by, expected_return_date, status) VALUES (?, ?, ?, ?, ?)`,
    [1, priyaId, managerId, '2024-12-31', 'Active']);
  await run(`INSERT INTO allocations (asset_id, employee_id, allocated_by, expected_return_date, status) VALUES (?, ?, ?, ?, ?)`,
    [4, rajId, managerId, '2024-11-30', 'Active']);

  const roomId = (await run(`INSERT INTO resources (name, type, location, capacity, status) VALUES (?, ?, ?, ?, ?)`,
    ['Conference Room B2', 'Room', 'HQ Floor 2', 10, 'Active'])).id;
  const vanId = (await run(`INSERT INTO resources (name, type, location, capacity, status) VALUES (?, ?, ?, ?, ?)`,
    ['Van AF-348', 'Vehicle', 'Parking A', 8, 'Active'])).id;

  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const start = new Date(tomorrow); start.setHours(9, 0, 0, 0);
  const end = new Date(tomorrow); end.setHours(10, 0, 0, 0);

  await run(`INSERT INTO bookings (resource_id, employee_id, start_time, end_time, purpose, status) VALUES (?, ?, ?, ?, ?, ?)`,
    [roomId, priyaId, start.toISOString(), end.toISOString(), 'Team Standup', 'Upcoming']);

  await run(`INSERT INTO maintenance_requests (asset_id, requested_by, issue_description, priority, status) VALUES (?, ?, ?, ?, ?)`,
    [2, rajId, 'Projector bulb not turning on', 'High', 'Pending']);

  const auditId = (await run(`INSERT INTO audit_cycles (name, scope_department_id, start_date, end_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    ['Q3 Audit - Engineering', engId, '2024-07-01', '2024-07-15', 'Open', adminId])).id;

  await run(`INSERT INTO audit_items (audit_cycle_id, asset_id, auditor_id, status) VALUES (?, ?, ?, ?)`,
    [auditId, 1, headId, 'Verified']);
  await run(`INSERT INTO audit_items (audit_cycle_id, asset_id, auditor_id, status) VALUES (?, ?, ?, ?)`,
    [auditId, 4, headId, 'Pending']);

  await run(`INSERT INTO notifications (user_id, type, message, related_type, is_read) VALUES (?, ?, ?, ?, ?)`,
    [priyaId, 'Asset Assigned', 'Laptop AF-0012 assigned to you', 'allocation', 0]);
  await run(`INSERT INTO notifications (user_id, type, message, related_type, is_read) VALUES (?, ?, ?, ?, ?)`,
    [rajId, 'Maintenance Request', 'Maintenance request AF-0062 approved', 'maintenance', 0]);

  await run(`INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)`,
    [managerId, 'Asset Allocated', 'Allocated AF-0012 to Priya Shah']);
  await run(`INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)`,
    [rajId, 'Booking Confirmed', 'Room B2 : 2:00 to 3:00 PM']);

  console.log('Database seeded successfully');
}

// Middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRoles(roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

async function logActivity(userId, action, details) {
  await run(`INSERT INTO activity_logs (user_id, action, details) VALUES (?, ?, ?)`, [userId, action, details]);
}

async function createNotification(userId, type, message, relatedId, relatedType) {
  await run(`INSERT INTO notifications (user_id, type, message, related_id, related_type) VALUES (?, ?, ?, ?, ?)`,
    [userId, type, message, relatedId, relatedType]);
}

async function generateAssetTag() {
  const row = await get(`SELECT COUNT(*) as count FROM assets`);
  const num = (row.count + 1).toString().padStart(4, '0');
  return `AF-${num}`;
}

// Auth Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Missing fields' });
    const existing = await get(`SELECT * FROM users WHERE email = ?`, [email]);
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const result = await run(`INSERT INTO users (email, password, name, role, status) VALUES (?, ?, ?, ?, ?)`,
      [email, hash, name, 'Employee', 'Active']);
    const token = jwt.sign({ id: result.id, email, role: 'Employee', name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: result.id, email, name, role: 'Employee' } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await get(`SELECT * FROM users WHERE email = ? AND status = 'Active'`, [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, department_id: user.department_id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const user = await get(`SELECT id, email, name, role, department_id, status FROM users WHERE id = ?`, [req.user.id]);
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Departments
app.get('/api/departments', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT d.*, u.name as head_name, p.name as parent_name FROM departments d LEFT JOIN users u ON d.head_id = u.id LEFT JOIN departments p ON d.parent_id = p.id ORDER BY d.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/departments', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { name, head_id, parent_id, status } = req.body;
    const result = await run(`INSERT INTO departments (name, head_id, parent_id, status) VALUES (?, ?, ?, ?)`,
      [name, head_id || null, parent_id || null, status || 'Active']);
    await logActivity(req.user.id, 'Department Created', `Created department ${name}`);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/departments/:id', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { name, head_id, parent_id, status } = req.body;
    await run(`UPDATE departments SET name = ?, head_id = ?, parent_id = ?, status = ? WHERE id = ?`,
      [name, head_id || null, parent_id || null, status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Categories
app.get('/api/categories', authenticate, async (req, res) => {
  try { const rows = await all(`SELECT * FROM asset_categories ORDER BY name`); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/categories', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { name, fields } = req.body;
    const result = await run(`INSERT INTO asset_categories (name, fields) VALUES (?, ?)`, [name, fields || '{}']);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/categories/:id', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { name, fields } = req.body;
    await run(`UPDATE asset_categories SET name = ?, fields = ? WHERE id = ?`, [name, fields || '{}', req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Employees
app.get('/api/employees', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT u.*, d.name as department_name FROM users u LEFT JOIN departments d ON u.department_id = d.id ORDER BY u.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/employees', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { email, name, department_id, role, status } = req.body;
    const hash = await bcrypt.hash('password123', 10);
    const result = await run(`INSERT INTO users (email, password, name, department_id, role, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [email, hash, name, department_id || null, role || 'Employee', status || 'Active']);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/employees/:id', authenticate, requireRoles(['Admin']), async (req, res) => {
  try {
    const { name, department_id, role, status } = req.body;
    await run(`UPDATE users SET name = ?, department_id = ?, role = ?, status = ? WHERE id = ?`,
      [name, department_id || null, role, status, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Assets
app.get('/api/assets', authenticate, async (req, res) => {
  try {
    const { search, category, status, department } = req.query;
    let sql = `SELECT a.*, c.name as category_name, u.name as holder_name, d.name as department_name FROM assets a LEFT JOIN asset_categories c ON a.category_id = c.id LEFT JOIN users u ON a.current_holder_id = u.id LEFT JOIN departments d ON a.department_id = d.id WHERE 1=1`;
    const params = [];
    if (search) { sql += ` AND (a.asset_tag LIKE ? OR a.serial_number LIKE ? OR a.name LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    if (category) { sql += ` AND a.category_id = ?`; params.push(category); }
    if (status) { sql += ` AND a.status = ?`; params.push(status); }
    if (department) { sql += ` AND a.department_id = ?`; params.push(department); }
    sql += ` ORDER BY a.created_at DESC`;
    const rows = await all(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/assets', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { name, category_id, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable } = req.body;
    const asset_tag = await generateAssetTag();
    const result = await run(`INSERT INTO assets (name, category_id, asset_tag, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, category_id, asset_tag, serial_number, acquisition_date, acquisition_cost, condition, location, is_bookable ? 1 : 0, 'Available']);
    await logActivity(req.user.id, 'Asset Registered', `Registered ${asset_tag}`);
    res.json({ id: result.id, asset_tag });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/assets/:id', authenticate, async (req, res) => {
  try {
    const asset = await get(`SELECT a.*, c.name as category_name, u.name as holder_name FROM assets a LEFT JOIN asset_categories c ON a.category_id = c.id LEFT JOIN users u ON a.current_holder_id = u.id WHERE a.id = ?`, [req.params.id]);
    if (!asset) return res.status(404).json({ error: 'Not found' });
    const history = await all(`SELECT al.*, u.name as employee_name, ub.name as allocated_by_name FROM allocations al LEFT JOIN users u ON al.employee_id = u.id LEFT JOIN users ub ON al.allocated_by = ub.id WHERE al.asset_id = ? ORDER BY al.allocated_at DESC`, [req.params.id]);
    const maintenance = await all(`SELECT m.*, u.name as requested_by_name, t.name as technician_name FROM maintenance_requests m LEFT JOIN users u ON m.requested_by = u.id LEFT JOIN users t ON m.technician_id = t.id WHERE m.asset_id = ? ORDER BY m.created_at DESC`, [req.params.id]);
    res.json({ ...asset, history, maintenance });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Allocations
app.post('/api/allocations', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    const { asset_id, employee_id, expected_return_date } = req.body;
    const asset = await get(`SELECT * FROM assets WHERE id = ?`, [asset_id]);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (asset.status === 'Allocated') return res.status(400).json({ error: 'Asset already allocated', current_holder: asset.current_holder_id });
    if (asset.status !== 'Available') return res.status(400).json({ error: `Asset is ${asset.status}` });
    await run(`UPDATE assets SET status = 'Allocated', current_holder_id = ? WHERE id = ?`, [employee_id, asset_id]);
    const result = await run(`INSERT INTO allocations (asset_id, employee_id, allocated_by, expected_return_date, status) VALUES (?, ?, ?, ?, ?)`,
      [asset_id, employee_id, req.user.id, expected_return_date, 'Active']);
    await createNotification(employee_id, 'Asset Assigned', `Asset ${asset.asset_tag} has been allocated to you`, result.id, 'allocation');
    await logActivity(req.user.id, 'Asset Allocated', `Allocated ${asset.asset_tag} to employee ${employee_id}`);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/allocations', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT a.*, ast.name as asset_name, ast.asset_tag, u.name as employee_name, ub.name as allocated_by_name FROM allocations a JOIN assets ast ON a.asset_id = ast.id LEFT JOIN users u ON a.employee_id = u.id LEFT JOIN users ub ON a.allocated_by = ub.id ORDER BY a.allocated_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/allocations/:id/return', authenticate, async (req, res) => {
  try {
    const { condition, notes } = req.body;
    const allocation = await get(`SELECT * FROM allocations WHERE id = ?`, [req.params.id]);
    if (!allocation) return res.status(404).json({ error: 'Not found' });
    await run(`UPDATE allocations SET returned_at = datetime('now'), return_condition = ?, return_notes = ?, status = 'Returned' WHERE id = ?`, [condition, notes, req.params.id]);
    await run(`UPDATE assets SET status = 'Available', current_holder_id = NULL WHERE id = ?`, [allocation.asset_id]);
    await logActivity(req.user.id, 'Asset Returned', `Returned allocation ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Transfers
app.post('/api/transfers', authenticate, async (req, res) => {
  try {
    const { asset_id, to_employee_id, reason } = req.body;
    const asset = await get(`SELECT * FROM assets WHERE id = ?`, [asset_id]);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    const result = await run(`INSERT INTO transfers (asset_id, from_employee_id, to_employee_id, requested_by, reason, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [asset_id, asset.current_holder_id, to_employee_id, req.user.id, reason, 'Requested']);
    if (asset.current_holder_id) await createNotification(asset.current_holder_id, 'Transfer Request', `Transfer requested for ${asset.asset_tag}`, result.id, 'transfer');
    await logActivity(req.user.id, 'Transfer Requested', `Requested transfer of ${asset.asset_tag}`);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/transfers', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT t.*, ast.name as asset_name, ast.asset_tag, fu.name as from_name, tu.name as to_name, ru.name as requested_by_name FROM transfers t JOIN assets ast ON t.asset_id = ast.id LEFT JOIN users fu ON t.from_employee_id = fu.id LEFT JOIN users tu ON t.to_employee_id = tu.id LEFT JOIN users ru ON t.requested_by = ru.id ORDER BY t.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/transfers/:id/approve', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    const transfer = await get(`SELECT * FROM transfers WHERE id = ?`, [req.params.id]);
    if (!transfer) return res.status(404).json({ error: 'Not found' });
    await run(`UPDATE transfers SET status = 'Approved', approved_by = ?, approved_at = datetime('now') WHERE id = ?`, [req.user.id, req.params.id]);
    await run(`UPDATE assets SET current_holder_id = ? WHERE id = ?`, [transfer.to_employee_id, transfer.asset_id]);
    await run(`UPDATE allocations SET status = 'Returned', returned_at = datetime('now') WHERE asset_id = ? AND status = 'Active'`, [transfer.asset_id]);
    await run(`INSERT INTO allocations (asset_id, employee_id, allocated_by, status) VALUES (?, ?, ?, ?)`,
      [transfer.asset_id, transfer.to_employee_id, req.user.id, 'Active']);
    await createNotification(transfer.to_employee_id, 'Transfer Approved', `Transfer approved for asset`, transfer.id, 'transfer');
    await logActivity(req.user.id, 'Transfer Approved', `Approved transfer ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/transfers/:id/reject', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    await run(`UPDATE transfers SET status = 'Rejected', approved_by = ? WHERE id = ?`, [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Resources
app.get('/api/resources', authenticate, async (req, res) => {
  try { const rows = await all(`SELECT * FROM resources WHERE status = 'Active' ORDER BY name`); res.json(rows); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/resources', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { name, type, location, capacity } = req.body;
    const result = await run(`INSERT INTO resources (name, type, location, capacity) VALUES (?, ?, ?, ?)`, [name, type, location, capacity]);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bookings
app.get('/api/bookings', authenticate, async (req, res) => {
  try {
    const { resource_id, date } = req.query;
    let sql = `SELECT b.*, r.name as resource_name, u.name as employee_name FROM bookings b JOIN resources r ON b.resource_id = r.id LEFT JOIN users u ON b.employee_id = u.id WHERE 1=1`;
    const params = [];
    if (resource_id) { sql += ` AND b.resource_id = ?`; params.push(resource_id); }
    if (date) { sql += ` AND date(b.start_time) = ?`; params.push(date); }
    sql += ` ORDER BY b.start_time DESC`;
    const rows = await all(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/bookings', authenticate, async (req, res) => {
  try {
    const { resource_id, start_time, end_time, purpose } = req.body;
    const overlaps = await all(`SELECT * FROM bookings WHERE resource_id = ? AND status NOT IN ('Cancelled', 'Completed') AND start_time < ? AND end_time > ?`, [resource_id, end_time, start_time]);
    if (overlaps.length > 0) return res.status(400).json({ error: 'Time slot overlaps with existing booking', conflicts: overlaps });
    const result = await run(`INSERT INTO bookings (resource_id, employee_id, start_time, end_time, purpose, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [resource_id, req.user.id, start_time, end_time, purpose, 'Upcoming']);
    await createNotification(req.user.id, 'Booking Confirmed', `Booking confirmed for ${purpose}`, result.id, 'booking');
    await logActivity(req.user.id, 'Booking Created', `Booked resource ${resource_id}`);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/bookings/:id/cancel', authenticate, async (req, res) => {
  try {
    await run(`UPDATE bookings SET status = 'Cancelled' WHERE id = ? AND employee_id = ?`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Maintenance
app.get('/api/maintenance', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT m.*, a.name as asset_name, a.asset_tag, u.name as requested_by_name, t.name as technician_name, ab.name as approved_by_name FROM maintenance_requests m JOIN assets a ON m.asset_id = a.id LEFT JOIN users u ON m.requested_by = u.id LEFT JOIN users t ON m.technician_id = t.id LEFT JOIN users ab ON m.approved_by = ab.id ORDER BY m.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/maintenance', authenticate, async (req, res) => {
  try {
    const { asset_id, issue_description, priority } = req.body;
    const result = await run(`INSERT INTO maintenance_requests (asset_id, requested_by, issue_description, priority, status) VALUES (?, ?, ?, ?, ?)`,
      [asset_id, req.user.id, issue_description, priority || 'Medium', 'Pending']);
    const managers = await all(`SELECT * FROM users WHERE role = 'Asset Manager'`);
    for (const m of managers) await createNotification(m.id, 'Maintenance Request', `New maintenance request for asset ${asset_id}`, result.id, 'maintenance');
    await logActivity(req.user.id, 'Maintenance Requested', `Requested maintenance for asset ${asset_id}`);
    res.json({ id: result.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id/approve', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { technician_id } = req.body;
    await run(`UPDATE maintenance_requests SET status = 'Approved', approved_by = ?, approved_at = datetime('now'), technician_id = ? WHERE id = ?`, [req.user.id, technician_id || null, req.params.id]);
    const req2 = await get(`SELECT * FROM maintenance_requests WHERE id = ?`, [req.params.id]);
    await run(`UPDATE assets SET status = 'Under Maintenance' WHERE id = ?`, [req2.asset_id]);
    await logActivity(req.user.id, 'Maintenance Approved', `Approved maintenance ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id/reject', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    await run(`UPDATE maintenance_requests SET status = 'Rejected', approved_by = ? WHERE id = ?`, [req.user.id, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id/assign', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { technician_id } = req.body;
    await run(`UPDATE maintenance_requests SET status = 'Technician Assigned', technician_id = ? WHERE id = ?`, [technician_id, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id/start', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    await run(`UPDATE maintenance_requests SET status = 'In Progress', started_at = datetime('now') WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id/resolve', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { resolution_notes } = req.body;
    await run(`UPDATE maintenance_requests SET status = 'Resolved', resolved_at = datetime('now'), resolution_notes = ? WHERE id = ?`, [resolution_notes, req.params.id]);
    const req2 = await get(`SELECT * FROM maintenance_requests WHERE id = ?`, [req.params.id]);
    await run(`UPDATE assets SET status = 'Available' WHERE id = ?`, [req2.asset_id]);
    await logActivity(req.user.id, 'Maintenance Resolved', `Resolved maintenance ${req.params.id}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Audits
app.get('/api/audits', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT ac.*, d.name as department_name, u.name as created_by_name FROM audit_cycles ac LEFT JOIN departments d ON ac.scope_department_id = d.id LEFT JOIN users u ON ac.created_by = u.id ORDER BY ac.created_at DESC`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/audits', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const { name, scope_department_id, scope_location, start_date, end_date } = req.body;
    const result = await run(`INSERT INTO audit_cycles (name, scope_department_id, scope_location, start_date, end_date, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [name, scope_department_id || null, scope_location, start_date, end_date, req.user.id]);
    let assetSql = `SELECT * FROM assets WHERE 1=1`; const params = [];
    if (scope_department_id) { assetSql += ` AND department_id = ?`; params.push(scope_department_id); }
    if (scope_location) { assetSql += ` AND location = ?`; params.push(scope_location); }
    const assets = await all(assetSql, params);
    for (const asset of assets) await run(`INSERT INTO audit_items (audit_cycle_id, asset_id) VALUES (?, ?)`, [result.id, asset.id]);
    await logActivity(req.user.id, 'Audit Created', `Created audit cycle ${name}`);
    res.json({ id: result.id, items_created: assets.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/audits/:id/items', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT ai.*, a.name as asset_name, a.asset_tag, a.location, u.name as auditor_name FROM audit_items ai JOIN assets a ON ai.asset_id = a.id LEFT JOIN users u ON ai.auditor_id = u.id WHERE ai.audit_cycle_id = ?`, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/audits/:id/items/:itemId', authenticate, async (req, res) => {
  try {
    const { status, notes } = req.body;
    await run(`UPDATE audit_items SET status = ?, notes = ?, auditor_id = ?, verified_at = datetime('now') WHERE id = ?`, [status, notes, req.user.id, req.params.itemId]);
    if (status === 'Missing') {
      const item = await get(`SELECT * FROM audit_items WHERE id = ?`, [req.params.itemId]);
      await run(`UPDATE assets SET status = 'Lost' WHERE id = ?`, [item.asset_id]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/audits/:id/close', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    await run(`UPDATE audit_cycles SET status = 'Closed', closed_at = datetime('now') WHERE id = ?`, [req.params.id]);
    const items = await all(`SELECT * FROM audit_items WHERE audit_cycle_id = ? AND status != 'Verified'`, [req.params.id]);
    await logActivity(req.user.id, 'Audit Closed', `Closed audit ${req.params.id} with ${items.length} discrepancies`);
    res.json({ discrepancies: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Notifications
app.get('/api/notifications', authenticate, async (req, res) => {
  try {
    const rows = await all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await run(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Activity Logs
app.get('/api/activity-logs', authenticate, requireRoles(['Admin', 'Asset Manager']), async (req, res) => {
  try {
    const rows = await all(`SELECT al.*, u.name as user_name FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 100`);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dashboard
app.get('/api/dashboard', authenticate, async (req, res) => {
  try {
    const available = await get(`SELECT COUNT(*) as count FROM assets WHERE status = 'Available'`);
    const allocated = await get(`SELECT COUNT(*) as count FROM assets WHERE status = 'Allocated'`);
    const maintenance = await get(`SELECT COUNT(*) as count FROM maintenance_requests WHERE status IN ('Approved', 'In Progress', 'Technician Assigned')`);
    const activeBookings = await get(`SELECT COUNT(*) as count FROM bookings WHERE status IN ('Upcoming', 'Ongoing')`);
    const pendingTransfers = await get(`SELECT COUNT(*) as count FROM transfers WHERE status = 'Requested'`);
    const now = new Date().toISOString();
    const upcomingReturns = await get(`SELECT COUNT(*) as count FROM allocations WHERE status = 'Active' AND expected_return_date > ? AND expected_return_date <= datetime('now', '+7 days')`, [now]);
    const overdueReturns = await all(`SELECT a.*, ast.name as asset_name, ast.asset_tag, u.name as employee_name FROM allocations a JOIN assets ast ON a.asset_id = ast.id LEFT JOIN users u ON a.employee_id = u.id WHERE a.status = 'Active' AND a.expected_return_date < ?`, [now]);
    const recentActivity = await all(`SELECT al.*, u.name as user_name FROM activity_logs al LEFT JOIN users u ON al.user_id = u.id ORDER BY al.created_at DESC LIMIT 10`);
    res.json({
      kpis: { available: available.count, allocated: allocated.count, maintenance: maintenance.count, activeBookings: activeBookings.count, pendingTransfers: pendingTransfers.count, upcomingReturns: upcomingReturns.count },
      overdueReturns, recentActivity
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reports
app.get('/api/reports/utilization', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    const deptUtil = await all(`SELECT d.name as department, COUNT(*) as count FROM assets a JOIN departments d ON a.department_id = d.id WHERE a.status = 'Allocated' GROUP BY d.id`);
    const mostUsed = await all(`SELECT a.name, a.asset_tag, COUNT(al.id) as allocation_count FROM assets a JOIN allocations al ON a.id = al.asset_id GROUP BY a.id ORDER BY allocation_count DESC LIMIT 5`);
    const idleAssets = await all(`SELECT name, asset_tag, location FROM assets WHERE status = 'Available' ORDER BY created_at ASC LIMIT 5`);
    res.json({ departmentUtilization: deptUtil, mostUsed, idleAssets });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/maintenance', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    const freq = await all(`SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as count FROM maintenance_requests GROUP BY month ORDER BY month DESC LIMIT 12`);
    const dueSoon = await all(`SELECT a.name, a.asset_tag, MAX(m.created_at) as last_maintenance FROM assets a LEFT JOIN maintenance_requests m ON a.id = m.asset_id WHERE a.status = 'Available' GROUP BY a.id HAVING last_maintenance IS NULL OR last_maintenance < datetime('now', '-90 days') LIMIT 10`);
    res.json({ frequency: freq, dueSoon });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/reports/bookings', authenticate, requireRoles(['Admin', 'Asset Manager', 'Department Head']), async (req, res) => {
  try {
    const heatmap = await all(`SELECT strftime('%H', start_time) as hour, COUNT(*) as count FROM bookings WHERE status != 'Cancelled' GROUP BY hour ORDER BY hour`);
    res.json({ heatmap });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Catch-all for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`AssetFlow server running on http://localhost:${PORT}`);
    console.log(`Default admin: admin@assetflow.com / admin123`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});