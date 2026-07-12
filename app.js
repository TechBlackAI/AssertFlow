const API_BASE = '';

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}/api${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
      }
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      app.router();
      return;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },
  get: (e) => api.request(e),
  post: (e, b) => api.request(e, { method: 'POST', body: JSON.stringify(b) }),
  put: (e, b) => api.request(e, { method: 'PUT', body: JSON.stringify(b) })
};

const app = {
  user: null,
  currentView: 'login',
  data: {},

  init() {
    this.user = JSON.parse(localStorage.getItem('user') || 'null');
    window.addEventListener('hashchange', () => this.router());
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-nav]')) {
        e.preventDefault();
        window.location.hash = e.target.dataset.nav;
      }
    });
    this.router();
  },

  async router() {
    const hash = window.location.hash.replace('#', '') || 'dashboard';
    
    if (!this.user && hash !== 'signup') {
      this.showLogin();
      return;
    }
    
    if (this.user) {
      document.getElementById('auth-screen').classList.add('hidden');
      document.getElementById('main-app').classList.remove('hidden');
      this.renderSidebar();
    } else {
      document.getElementById('auth-screen').classList.remove('hidden');
      document.getElementById('main-app').classList.add('hidden');
    }
    
    switch(hash) {
      case 'login': this.showLogin(); break;
      case 'signup': this.showSignup(); break;
      case 'dashboard': await this.showDashboard(); break;
      case 'organization': await this.showOrganization(); break;
      case 'assets': await this.showAssets(); break;
      case 'allocation': await this.showAllocation(); break;
      case 'booking': await this.showBooking(); break;
      case 'maintenance': await this.showMaintenance(); break;
      case 'audit': await this.showAudit(); break;
      case 'reports': await this.showReports(); break;
      case 'notifications': await this.showNotifications(); break;
      default: await this.showDashboard();
    }
  },

  // Auth
  showLogin() {
    const screen = document.getElementById('auth-screen');
    screen.classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">AF</div>
        <h1>AssetFlow</h1>
        <p>Enterprise Asset & Resource Management</p>
        <form id="login-form">
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="login-email" placeholder="name@company.com" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="login-password" placeholder="••••••••" required>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px;">Sign In</button>
        </form>
        <div style="margin-top:16px; text-align:right;">
          <a class="link" onclick="app.showToast('Contact admin to reset password', 'info')">Forgot password?</a>
        </div>
        <div class="divider"></div>
        <p style="margin-bottom:12px;">New here?</p>
        <p style="font-size:13px; color: var(--text); margin-bottom:16px;">Sign up creates an employee account. Admin roles assigned later.</p>
        <button class="btn btn-secondary" style="width:100%" onclick="window.location.hash='signup'">Create Account</button>
      </div>
    `;
    document.getElementById('login-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const data = await api.post('/auth/login', {
          email: document.getElementById('login-email').value,
          password: document.getElementById('login-password').value
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        this.user = data.user;
        window.location.hash = 'dashboard';
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  },

  showSignup() {
    const screen = document.getElementById('auth-screen');
    screen.classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    screen.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">AF</div>
        <h1>Create Account</h1>
        <p>Employee account registration</p>
        <form id="signup-form">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="signup-name" required>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="signup-email" placeholder="name@company.com" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="signup-password" required minlength="6">
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:8px;">Create Account</button>
        </form>
        <div style="margin-top:16px;">
          <a class="link" onclick="window.location.hash='login'">Already have an account? Sign in</a>
        </div>
      </div>
    `;
    document.getElementById('signup-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const data = await api.post('/auth/signup', {
          name: document.getElementById('signup-name').value,
          email: document.getElementById('signup-email').value,
          password: document.getElementById('signup-password').value
        });
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        this.user = data.user;
        this.showToast('Account created! You are logged in as Employee.', 'success');
        window.location.hash = 'dashboard';
      } catch (err) {
        this.showToast(err.message, 'error');
      }
    };
  },

  renderSidebar() {
    const role = this.user?.role || 'Employee';
    const items = [
      { id: 'dashboard', label: 'Dashboard', icon: '◈', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
      { id: 'organization', label: 'Organization Setup', icon: '⚙', roles: ['Admin'] },
      { id: 'assets', label: 'Assets', icon: '▣', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
      { id: 'allocation', label: 'Allocation & Transfer', icon: '⇄', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
      { id: 'booking', label: 'Resource Booking', icon: '◷', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
      { id: 'maintenance', label: 'Maintenance', icon: '✚', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
      { id: 'audit', label: 'Asset Audit', icon: '✓', roles: ['Admin', 'Asset Manager', 'Department Head'] },
      { id: 'reports', label: 'Reports & Analytics', icon: '◧', roles: ['Admin', 'Asset Manager', 'Department Head'] },
      { id: 'notifications', label: 'Notifications', icon: '◉', roles: ['Admin', 'Asset Manager', 'Department Head', 'Employee'] },
    ];
    
    const current = window.location.hash.replace('#', '') || 'dashboard';
    const navItems = items.filter(i => i.roles.includes(role)).map(i => `
      <a class="nav-item ${current === i.id ? 'active' : ''}" data-nav="${i.id}">
        <span class="icon">${i.icon}</span>
        <span>${i.label}</span>
      </a>
    `).join('');
    
    document.getElementById('sidebar').innerHTML = `
      <div class="sidebar-brand">
        <div class="logo-icon">AF</div>
        <span>AssetFlow</span>
      </div>
      <nav>${navItems}</nav>
      <div class="sidebar-footer">
        <div class="user-info">
          <div class="user-avatar">${this.user.name.charAt(0)}</div>
          <div class="user-meta">
            <div class="name">${this.user.name}</div>
            <div class="role">${this.user.role}</div>
          </div>
        </div>
        <button class="btn btn-secondary" style="width:100%; margin-top:12px;" onclick="app.logout()">Logout</button>
      </div>
    `;
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.user = null;
    window.location.hash = 'login';
  },

  // Dashboard
  async showDashboard() {
    const content = document.getElementById('content');
    try {
      const data = await api.get('/dashboard');
      const kpis = data.kpis;
      
      content.innerHTML = `
        <div class="content-header">
          <h1>Today's Overview</h1>
          <p>Real-time operational snapshot</p>
        </div>
        
        <div class="kpi-grid">
          <div class="kpi-card success">
            <div class="kpi-label">Available</div>
            <div class="kpi-value">${kpis.available}</div>
          </div>
          <div class="kpi-card accent">
            <div class="kpi-label">Allocated</div>
            <div class="kpi-value">${kpis.allocated}</div>
          </div>
          <div class="kpi-card warning">
            <div class="kpi-label">Maintenance</div>
            <div class="kpi-value">${kpis.maintenance}</div>
          </div>
          <div class="kpi-card accent">
            <div class="kpi-label">Active Bookings</div>
            <div class="kpi-value">${kpis.activeBookings}</div>
          </div>
          <div class="kpi-card danger">
            <div class="kpi-label">Pending Transfers</div>
            <div class="kpi-value">${kpis.pendingTransfers}</div>
          </div>
          <div class="kpi-card success">
            <div class="kpi-label">Upcoming Returns</div>
            <div class="kpi-value">${kpis.upcomingReturns}</div>
          </div>
        </div>
        
        ${data.overdueReturns.length ? `
          <div class="alert-banner">
            <span>⚠</span>
            <span><strong>${data.overdueReturns.length} assets</strong> overdue for return — flagged for follow-up</span>
          </div>
        ` : ''}
        
        <div class="quick-actions">
          <button class="btn btn-primary" onclick="window.location.hash='assets'">+ Register Asset</button>
          <button class="btn btn-secondary" onclick="window.location.hash='booking'">Book Resource</button>
          <button class="btn btn-secondary" onclick="window.location.hash='maintenance'">Raise Request</button>
        </div>
        
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Recent Activity</h3>
          </div>
          <div class="activity-list">
            ${data.recentActivity.map(a => `
              <div class="activity-item">
                <div class="activity-icon">◈</div>
                <div class="activity-content">
                  <div class="title">${a.action}</div>
                  <div>${a.details}</div>
                  <div class="time">${new Date(a.created_at).toLocaleString()}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div class="card">Error loading dashboard: ${err.message}</div>`;
    }
  },

  // Organization
  async showOrganization() {
    if (this.user.role !== 'Admin') { window.location.hash = 'dashboard'; return; }
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Organization Setup</h1>
        <p>Manage departments, categories, and employees</p>
      </div>
      <div class="tabs">
        <div class="tab active" onclick="app.switchOrgTab('departments', this)">Departments</div>
        <div class="tab" onclick="app.switchOrgTab('categories', this)">Categories</div>
        <div class="tab" onclick="app.switchOrgTab('employees', this)">Employees</div>
      </div>
      <div id="org-content"></div>
    `;
    await this.loadDepartments();
  },

  async switchOrgTab(tab, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    if (tab === 'departments') await this.loadDepartments();
    else if (tab === 'categories') await this.loadCategories();
    else if (tab === 'employees') await this.loadEmployees();
  },

  async loadDepartments() {
    const container = document.getElementById('org-content');
    try {
      const depts = await api.get('/departments');
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Departments</h3>
            <button class="btn btn-primary btn-sm" onclick="app.showDeptModal()">+ Add Department</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Department</th><th>Head</th><th>Parent Dept</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${depts.map(d => `
                  <tr>
                    <td>${d.name}</td>
                    <td>${d.head_name || '—'}</td>
                    <td>${d.parent_name || '—'}</td>
                    <td><span class="badge badge-${d.status === 'Active' ? 'available' : 'maintenance'}">${d.status}</span></td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="app.showDeptModal(${d.id}, '${d.name}', ${d.head_id || 'null'}, ${d.parent_id || 'null'}, '${d.status}')">Edit</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) { container.innerHTML = `<div class="card">Error: ${err.message}</div>`; }
  },

  async loadCategories() {
    const container = document.getElementById('org-content');
    try {
      const cats = await api.get('/categories');
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Asset Categories</h3>
            <button class="btn btn-primary btn-sm" onclick="app.showCategoryModal()">+ Add Category</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Custom Fields</th><th>Actions</th></tr></thead>
              <tbody>
                ${cats.map(c => `
                  <tr>
                    <td>${c.name}</td>
                    <td><code>${c.fields || '{}'}</code></td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="app.showCategoryModal(${c.id}, '${c.name}', '${c.fields || '{}'}')">Edit</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) { container.innerHTML = `<div class="card">Error: ${err.message}</div>`; }
  },

  async loadEmployees() {
    const container = document.getElementById('org-content');
    try {
      const emps = await api.get('/employees');
      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Employee Directory</h3>
            <button class="btn btn-primary btn-sm" onclick="app.showEmployeeModal()">+ Add Employee</button>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                ${emps.map(e => `
                  <tr>
                    <td>${e.name}</td>
                    <td>${e.email}</td>
                    <td>${e.department_name || '—'}</td>
                    <td><span class="badge badge-allocated">${e.role}</span></td>
                    <td><span class="badge badge-${e.status === 'Active' ? 'available' : 'maintenance'}">${e.status}</span></td>
                    <td>
                      <button class="btn btn-sm btn-secondary" onclick="app.showEmployeeModal(${e.id}, '${e.name}', '${e.email}', ${e.department_id || 'null'}, '${e.role}', '${e.status}')">Edit</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) { container.innerHTML = `<div class="card">Error: ${err.message}</div>`; }
  },

  // Modals for Organization
  showDeptModal(id, name, headId, parentId, status) {
    this.showModal('Department', `
      <form id="dept-form">
        <div class="form-group"><label>Name</label><input type="text" id="d-name" value="${name || ''}" required></div>
        <div class="form-group"><label>Head ID</label><input type="number" id="d-head" value="${headId || ''}"></div>
        <div class="form-group"><label>Parent Dept ID</label><input type="number" id="d-parent" value="${parentId || ''}"></div>
        <div class="form-group"><label>Status</label>
          <select id="d-status"><option value="Active" ${status === 'Active' ? 'selected' : ''}>Active</option><option value="Inactive" ${status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${id ? 'Update' : 'Create'}</button>
        </div>
      </form>
    `, async () => {
      document.getElementById('dept-form').onsubmit = async (e) => {
        e.preventDefault();
        const body = {
          name: document.getElementById('d-name').value,
          head_id: document.getElementById('d-head').value || null,
          parent_id: document.getElementById('d-parent').value || null,
          status: document.getElementById('d-status').value
        };
        try {
          if (id) await api.put(`/departments/${id}`, body);
          else await api.post('/departments', body);
          this.showToast('Department saved', 'success');
          this.closeModal();
          await this.loadDepartments();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  showCategoryModal(id, name, fields) {
    this.showModal('Category', `
      <form id="cat-form">
        <div class="form-group"><label>Name</label><input type="text" id="c-name" value="${name || ''}" required></div>
        <div class="form-group"><label>Fields (JSON)</label><textarea id="c-fields" rows="3">${fields || '{}'}</textarea></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${id ? 'Update' : 'Create'}</button>
        </div>
      </form>
    `, async () => {
      document.getElementById('cat-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          const body = { name: document.getElementById('c-name').value, fields: document.getElementById('c-fields').value };
          if (id) await api.put(`/categories/${id}`, body);
          else await api.post('/categories', body);
          this.showToast('Category saved', 'success');
          this.closeModal();
          await this.loadCategories();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  showEmployeeModal(id, name, email, deptId, role, status) {
    this.showModal('Employee', `
      <form id="emp-form">
        <div class="form-group"><label>Name</label><input type="text" id="e-name" value="${name || ''}" required></div>
        <div class="form-group"><label>Email</label><input type="email" id="e-email" value="${email || ''}" required></div>
        <div class="form-group"><label>Department ID</label><input type="number" id="e-dept" value="${deptId || ''}"></div>
        <div class="form-group"><label>Role</label>
          <select id="e-role">
            <option value="Employee" ${role === 'Employee' ? 'selected' : ''}>Employee</option>
            <option value="Department Head" ${role === 'Department Head' ? 'selected' : ''}>Department Head</option>
            <option value="Asset Manager" ${role === 'Asset Manager' ? 'selected' : ''}>Asset Manager</option>
            <option value="Admin" ${role === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="form-group"><label>Status</label>
          <select id="e-status"><option value="Active" ${status === 'Active' ? 'selected' : ''}>Active</option><option value="Inactive" ${status === 'Inactive' ? 'selected' : ''}>Inactive</option></select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">${id ? 'Update' : 'Create'}</button>
        </div>
      </form>
    `, async () => {
      document.getElementById('emp-form').onsubmit = async (e) => {
        e.preventDefault();
        const body = {
          name: document.getElementById('e-name').value,
          email: document.getElementById('e-email').value,
          department_id: document.getElementById('e-dept').value || null,
          role: document.getElementById('e-role').value,
          status: document.getElementById('e-status').value
        };
        try {
          if (id) await api.put(`/employees/${id}`, body);
          else await api.post('/employees', body);
          this.showToast('Employee saved', 'success');
          this.closeModal();
          await this.loadEmployees();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  // Assets
  async showAssets() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Asset Registration & Directory</h1>
        <p>Register and track assets centrally</p>
      </div>
      <div class="card">
        <div class="search-bar">
          <input type="text" id="asset-search" placeholder="Search by tag, serial, or QR code...">
          <select id="asset-filter-cat"><option value="">All Categories</option></select>
          <select id="asset-filter-status"><option value="">All Status</option>
            <option value="Available">Available</option><option value="Allocated">Allocated</option>
            <option value="Under Maintenance">Under Maintenance</option><option value="Lost">Lost</option>
          </select>
          <button class="btn btn-primary" onclick="app.showAssetModal()">+ Register Asset</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Status</th><th>Location</th><th>Actions</th></tr></thead>
            <tbody id="asset-table"></tbody>
          </table>
        </div>
      </div>
    `;
    
    try {
      const cats = await api.get('/categories');
      const catSelect = document.getElementById('asset-filter-cat');
      cats.forEach(c => catSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`);
    } catch (e) {}
    
    await this.loadAssets();
    
    document.getElementById('asset-search').oninput = () => this.loadAssets();
    document.getElementById('asset-filter-cat').onchange = () => this.loadAssets();
    document.getElementById('asset-filter-status').onchange = () => this.loadAssets();
  },

  async loadAssets() {
    const search = document.getElementById('asset-search')?.value || '';
    const cat = document.getElementById('asset-filter-cat')?.value || '';
    const status = document.getElementById('asset-filter-status')?.value || '';
    try {
      const assets = await api.get(`/assets?search=${encodeURIComponent(search)}&category=${cat}&status=${status}`);
      const tbody = document.getElementById('asset-table');
      tbody.innerHTML = assets.map(a => `
        <tr>
          <td><strong>${a.asset_tag}</strong></td>
          <td>${a.name}</td>
          <td>${a.category_name || '—'}</td>
          <td><span class="badge badge-${a.status.toLowerCase().replace(' ', '-')}">${a.status}</span></td>
          <td>${a.location || '—'}</td>
          <td><button class="btn btn-sm btn-secondary" onclick="app.viewAsset(${a.id})">View</button></td>
        </tr>
      `).join('');
    } catch (err) { document.getElementById('asset-table').innerHTML = `<tr><td colspan="6">Error: ${err.message}</td></tr>`; }
  },

  showAssetModal() {
    this.showModal('Register Asset', `
      <form id="asset-form">
        <div class="form-row">
          <div class="form-group"><label>Name</label><input type="text" id="a-name" required></div>
          <div class="form-group"><label>Category</label><select id="a-cat" required></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Serial Number</label><input type="text" id="a-serial"></div>
          <div class="form-group"><label>Acquisition Date</label><input type="date" id="a-date"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Cost</label><input type="number" id="a-cost" step="0.01"></div>
          <div class="form-group"><label>Condition</label><select id="a-condition"><option>Good</option><option>Fair</option><option>Excellent</option><option>Poor</option></select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Location</label><input type="text" id="a-location"></div>
          <div class="form-group"><label>Bookable</label><select id="a-bookable"><option value="0">No</option><option value="1">Yes</option></select></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Register</button>
        </div>
      </form>
    `, async () => {
      const cats = await api.get('/categories');
      const sel = document.getElementById('a-cat');
      cats.forEach(c => sel.innerHTML += `<option value="${c.id}">${c.name}</option>`);
      document.getElementById('asset-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.post('/assets', {
            name: document.getElementById('a-name').value,
            category_id: document.getElementById('a-cat').value,
            serial_number: document.getElementById('a-serial').value,
            acquisition_date: document.getElementById('a-date').value,
            acquisition_cost: document.getElementById('a-cost').value,
            condition: document.getElementById('a-condition').value,
            location: document.getElementById('a-location').value,
            is_bookable: document.getElementById('a-bookable').value === '1'
          });
          this.showToast('Asset registered', 'success');
          this.closeModal();
          await this.loadAssets();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  async viewAsset(id) {
    try {
      const asset = await api.get(`/assets/${id}`);
      this.showModal(`Asset ${asset.asset_tag}`, `
        <div style="margin-bottom:20px;">
          <p><strong>Name:</strong> ${asset.name}</p>
          <p><strong>Category:</strong> ${asset.category_name || '—'}</p>
          <p><strong>Status:</strong> <span class="badge badge-${asset.status.toLowerCase().replace(' ', '-')}">${asset.status}</span></p>
          <p><strong>Location:</strong> ${asset.location || '—'}</p>
          <p><strong>Condition:</strong> ${asset.condition || '—'}</p>
          <p><strong>Current Holder:</strong> ${asset.holder_name || 'None'}</p>
        </div>
        <h4 style="color:var(--text-h); margin-bottom:12px;">Allocation History</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Employee</th><th>Status</th><th>Return Date</th></tr></thead>
            <tbody>
              ${asset.history.map(h => `
                <tr>
                  <td>${new Date(h.allocated_at).toLocaleDateString()}</td>
                  <td>${h.employee_name || '—'}</td>
                  <td><span class="badge badge-${h.status.toLowerCase()}">${h.status}</span></td>
                  <td>${h.expected_return_date || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <h4 style="color:var(--text-h); margin:20px 0 12px;">Maintenance History</h4>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Issue</th><th>Status</th></tr></thead>
            <tbody>
              ${asset.maintenance.map(m => `
                <tr>
                  <td>${new Date(m.created_at).toLocaleDateString()}</td>
                  <td>${m.issue_description}</td>
                  <td><span class="badge badge-${m.status.toLowerCase().replace(' ', '-')}">${m.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  // Allocation & Transfer
  async showAllocation() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Asset Allocation & Transfer</h1>
        <p>Manage who holds what, with explicit conflict rules</p>
      </div>
      <div class="card">
        <div class="form-group">
          <label>Select Asset</label>
          <select id="alloc-asset" onchange="app.checkAssetStatus()"><option value="">Choose an asset...</option></select>
        </div>
        <div id="asset-status-banner"></div>
        <div id="alloc-form-wrap" class="hidden" style="margin-top:20px;">
          <div class="form-row">
            <div class="form-group"><label>Allocate To (Employee ID)</label><input type="number" id="alloc-emp"></div>
            <div class="form-group"><label>Expected Return Date</label><input type="date" id="alloc-return"></div>
          </div>
          <button class="btn btn-primary" onclick="app.allocateAsset()">Allocate Asset</button>
        </div>
        <div id="transfer-form-wrap" class="hidden" style="margin-top:20px;">
          <h4 style="color:var(--text-h); margin-bottom:12px;">Transfer Request</h4>
          <div class="form-row">
            <div class="form-group"><label>From</label><input type="text" id="transfer-from" readonly></div>
            <div class="form-group"><label>To (Employee ID)</label><input type="number" id="transfer-to"></div>
          </div>
          <div class="form-group"><label>Reason</label><textarea id="transfer-reason" rows="3"></textarea></div>
          <button class="btn btn-primary" onclick="app.requestTransfer()">Submit Request</button>
        </div>
      </div>
      <div class="card" style="margin-top:24px;">
        <h3 class="card-title" style="margin-bottom:16px;">Allocation History</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Employee</th><th>Allocated By</th><th>Return Date</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="alloc-history"></tbody>
          </table>
        </div>
      </div>
    `;
    
    try {
      const assets = await api.get('/assets?status=Available');
      const sel = document.getElementById('alloc-asset');
      assets.forEach(a => sel.innerHTML += `<option value="${a.id}">${a.asset_tag} - ${a.name}</option>`);
      
      const allAssets = await api.get('/assets');
      allAssets.forEach(a => {
        if (a.status === 'Allocated') sel.innerHTML += `<option value="${a.id}" disabled>${a.asset_tag} - ${a.name} (${a.status})</option>`;
      });
    } catch (e) {}
    
    await this.loadAllocationHistory();
  },

  async checkAssetStatus() {
    const id = document.getElementById('alloc-asset').value;
    if (!id) { document.getElementById('asset-status-banner').innerHTML = ''; return; }
    try {
      const asset = await api.get(`/assets/${id}`);
      const banner = document.getElementById('asset-status-banner');
      if (asset.status === 'Allocated') {
        banner.innerHTML = `
          <div class="alert-banner">
            <span>⚠</span>
            <span>Already allocated to <strong>${asset.holder_name}</strong>. Direct re-allocation is blocked — submit a transfer request below.</span>
          </div>
        `;
        document.getElementById('alloc-form-wrap').classList.add('hidden');
        document.getElementById('transfer-form-wrap').classList.remove('hidden');
        document.getElementById('transfer-from').value = asset.holder_name || 'Unknown';
      } else {
        banner.innerHTML = `<div class="alert-banner" style="background:rgba(34,197,94,0.1); border-color:rgba(34,197,94,0.3); color:var(--success);"><span>✓</span><span>Asset is available for allocation</span></div>`;
        document.getElementById('alloc-form-wrap').classList.remove('hidden');
        document.getElementById('transfer-form-wrap').classList.add('hidden');
      }
    } catch (err) {}
  },

  async allocateAsset() {
    const assetId = document.getElementById('alloc-asset').value;
    const empId = document.getElementById('alloc-emp').value;
    const returnDate = document.getElementById('alloc-return').value;
    if (!assetId || !empId) { this.showToast('Please fill all fields', 'error'); return; }
    try {
      await api.post('/allocations', { asset_id: assetId, employee_id: empId, expected_return_date: returnDate });
      this.showToast('Asset allocated successfully', 'success');
      await this.showAllocation();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async requestTransfer() {
    const assetId = document.getElementById('alloc-asset').value;
    const toId = document.getElementById('transfer-to').value;
    const reason = document.getElementById('transfer-reason').value;
    if (!assetId || !toId) { this.showToast('Please fill all fields', 'error'); return; }
    try {
      await api.post('/transfers', { asset_id: assetId, to_employee_id: toId, reason });
      this.showToast('Transfer request submitted', 'success');
      await this.showAllocation();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async loadAllocationHistory() {
    try {
      const allocs = await api.get('/allocations');
      document.getElementById('alloc-history').innerHTML = allocs.map(a => `
        <tr>
          <td>${a.asset_tag}</td>
          <td>${a.employee_name || '—'}</td>
          <td>${a.allocated_by_name || '—'}</td>
          <td>${a.expected_return_date || '—'}</td>
          <td><span class="badge badge-${a.status.toLowerCase()}">${a.status}</span></td>
          <td>
            ${a.status === 'Active' ? `<button class="btn btn-sm btn-secondary" onclick="app.returnAsset(${a.id})">Return</button>` : '—'}
          </td>
        </tr>
      `).join('');
    } catch (err) {}
  },

  async returnAsset(id) {
    const condition = prompt('Return condition:');
    if (condition === null) return;
    try {
      await api.put(`/allocations/${id}/return`, { condition, notes: '' });
      this.showToast('Asset returned', 'success');
      await this.loadAllocationHistory();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  // Booking
  async showBooking() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Resource Booking</h1>
        <p>Time-slot booking of shared resources with no overlaps</p>
      </div>
      <div class="card">
        <div class="form-row">
          <div class="form-group">
            <label>Resource</label>
            <select id="book-resource" onchange="app.loadBookings()"><option value="">Select resource...</option></select>
          </div>
          <div class="form-group">
            <label>Date</label>
            <input type="date" id="book-date" onchange="app.loadBookings()" value="${new Date().toISOString().split('T')[0]}">
          </div>
        </div>
        <div id="booking-calendar" style="margin:20px 0;"></div>
        <div class="card" style="background:var(--code-bg);">
          <h4 style="color:var(--text-h); margin-bottom:16px;">New Booking</h4>
          <div class="form-row">
            <div class="form-group"><label>Start Time</label><input type="datetime-local" id="book-start"></div>
            <div class="form-group"><label>End Time</label><input type="datetime-local" id="book-end"></div>
          </div>
          <div class="form-group"><label>Purpose</label><input type="text" id="book-purpose" placeholder="Meeting, event, etc."></div>
          <button class="btn btn-primary" onclick="app.createBooking()">Book a Slot</button>
        </div>
      </div>
      <div class="card" style="margin-top:24px;">
        <h3 class="card-title" style="margin-bottom:16px;">My Bookings</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Resource</th><th>Start</th><th>End</th><th>Purpose</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody id="my-bookings"></tbody>
          </table>
        </div>
      </div>
    `;
    
    try {
      const resources = await api.get('/resources');
      const sel = document.getElementById('book-resource');
      resources.forEach(r => sel.innerHTML += `<option value="${r.id}">${r.name} (${r.type || 'Resource'})</option>`);
    } catch (e) {}
    
    await this.loadMyBookings();
  },

  async loadBookings() {
    const resourceId = document.getElementById('book-resource').value;
    const date = document.getElementById('book-date').value;
    if (!resourceId || !date) return;
    try {
      const bookings = await api.get(`/bookings?resource_id=${resourceId}&date=${date}`);
      const container = document.getElementById('booking-calendar');
      if (bookings.length === 0) {
        container.innerHTML = `<p style="color:var(--text); font-size:14px;">No bookings for this date. The slot is fully available.</p>`;
      } else {
        container.innerHTML = `
          <h4 style="color:var(--text-h); margin-bottom:12px;">Existing Bookings</h4>
          <div style="display:flex; flex-direction:column; gap:8px;">
            ${bookings.map(b => `
              <div style="padding:10px 14px; background:var(--card-bg); border:1px solid var(--border); border-radius:8px; font-size:14px;">
                <strong>${new Date(b.start_time).toLocaleTimeString()} - ${new Date(b.end_time).toLocaleTimeString()}</strong>
                <span style="color:var(--text); margin-left:8px;">${b.purpose || 'No purpose'} by ${b.employee_name}</span>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {}
  },

  async createBooking() {
    const resourceId = document.getElementById('book-resource').value;
    const start = document.getElementById('book-start').value;
    const end = document.getElementById('book-end').value;
    const purpose = document.getElementById('book-purpose').value;
    if (!resourceId || !start || !end) { this.showToast('Please fill all fields', 'error'); return; }
    try {
      await api.post('/bookings', { resource_id: resourceId, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), purpose });
      this.showToast('Booking confirmed!', 'success');
      await this.loadBookings();
      await this.loadMyBookings();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async loadMyBookings() {
    try {
      const bookings = await api.get('/bookings');
      document.getElementById('my-bookings').innerHTML = bookings.map(b => `
        <tr>
          <td>${b.resource_name}</td>
          <td>${new Date(b.start_time).toLocaleString()}</td>
          <td>${new Date(b.end_time).toLocaleString()}</td>
          <td>${b.purpose || '—'}</td>
          <td><span class="badge badge-${b.status.toLowerCase()}">${b.status}</span></td>
          <td>
            ${b.status === 'Upcoming' ? `<button class="btn btn-sm btn-danger" onclick="app.cancelBooking(${b.id})">Cancel</button>` : '—'}
          </td>
        </tr>
      `).join('');
    } catch (err) {}
  },

  async cancelBooking(id) {
    try {
      await api.put(`/bookings/${id}/cancel`);
      this.showToast('Booking cancelled', 'success');
      await this.loadMyBookings();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  // Maintenance
  async showMaintenance() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Maintenance Management</h1>
        <p>Approval workflow as kanban board</p>
      </div>
      <div class="quick-actions" style="margin-bottom:24px;">
        <button class="btn btn-primary" onclick="app.showMaintenanceModal()">+ Raise Request</button>
      </div>
      <div class="kanban" id="kanban-board"></div>
    `;
    await this.loadKanban();
  },

  async loadKanban() {
    try {
      const requests = await api.get('/maintenance');
      const columns = ['Pending', 'Approved', 'Technician Assigned', 'In Progress', 'Resolved'];
      const container = document.getElementById('kanban-board');
      container.innerHTML = columns.map(col => {
        const items = requests.filter(r => r.status === col);
        return `
          <div class="kanban-column">
            <div class="kanban-header">
              <span>${col}</span>
              <span class="kanban-count">${items.length}</span>
            </div>
            ${items.map(item => `
              <div class="kanban-card" onclick="app.viewMaintenance(${item.id})">
                <div class="kanban-card-title">${item.asset_name} (${item.asset_tag})</div>
                <div class="kanban-card-meta">${item.issue_description.substring(0, 60)}...</div>
                <div class="kanban-card-meta">By: ${item.requested_by_name}</div>
                <div class="kanban-card-meta">Priority: <span class="badge badge-${item.priority.toLowerCase()}">${item.priority}</span></div>
                ${this.canManageMaintenance() && col === 'Pending' ? `
                  <div class="kanban-card-actions">
                    <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); app.approveMaintenance(${item.id})">Approve</button>
                    <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); app.rejectMaintenance(${item.id})">Reject</button>
                  </div>
                ` : ''}
                ${this.canManageMaintenance() && col === 'Approved' ? `
                  <div class="kanban-card-actions">
                    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); app.assignTech(${item.id})">Assign Tech</button>
                    <button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); app.startMaintenance(${item.id})">Start</button>
                  </div>
                ` : ''}
                ${this.canManageMaintenance() && col === 'In Progress' ? `
                  <div class="kanban-card-actions">
                    <button class="btn btn-sm btn-success" onclick="event.stopPropagation(); app.resolveMaintenance(${item.id})">Resolve</button>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `;
      }).join('');
    } catch (err) { document.getElementById('kanban-board').innerHTML = `<div class="card">Error: ${err.message}</div>`; }
  },

  canManageMaintenance() {
    return ['Admin', 'Asset Manager'].includes(this.user.role);
  },

  showMaintenanceModal() {
    this.showModal('Raise Maintenance Request', `
      <form id="maint-form">
        <div class="form-group">
          <label>Asset</label>
          <select id="m-asset" required></select>
        </div>
        <div class="form-group">
          <label>Issue Description</label>
          <textarea id="m-desc" rows="4" required></textarea>
        </div>
        <div class="form-group">
          <label>Priority</label>
          <select id="m-priority"><option>Low</option><option selected>Medium</option><option>High</option><option>Critical</option></select>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Submit Request</button>
        </div>
      </form>
    `, async () => {
      const assets = await api.get('/assets');
      const sel = document.getElementById('m-asset');
      assets.forEach(a => sel.innerHTML += `<option value="${a.id}">${a.asset_tag} - ${a.name}</option>`);
      document.getElementById('maint-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.post('/maintenance', {
            asset_id: document.getElementById('m-asset').value,
            issue_description: document.getElementById('m-desc').value,
            priority: document.getElementById('m-priority').value
          });
          this.showToast('Request submitted', 'success');
          this.closeModal();
          await this.loadKanban();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  async approveMaintenance(id) {
    try {
      await api.put(`/maintenance/${id}/approve`, {});
      this.showToast('Maintenance approved', 'success');
      await this.loadKanban();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async rejectMaintenance(id) {
    try {
      await api.put(`/maintenance/${id}/reject`, {});
      this.showToast('Maintenance rejected', 'success');
      await this.loadKanban();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async assignTech(id) {
    const techId = prompt('Enter Technician ID:');
    if (!techId) return;
    try {
      await api.put(`/maintenance/${id}/assign`, { technician_id: techId });
      this.showToast('Technician assigned', 'success');
      await this.loadKanban();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async startMaintenance(id) {
    try {
      await api.put(`/maintenance/${id}/start`, {});
      this.showToast('Maintenance started', 'success');
      await this.loadKanban();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async resolveMaintenance(id) {
    const notes = prompt('Resolution notes:') || '';
    try {
      await api.put(`/maintenance/${id}/resolve`, { resolution_notes: notes });
      this.showToast('Maintenance resolved', 'success');
      await this.loadKanban();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async viewMaintenance(id) {
    try {
      const reqs = await api.get('/maintenance');
      const m = reqs.find(r => r.id === id);
      if (!m) return;
      this.showModal('Maintenance Details', `
        <p><strong>Asset:</strong> ${m.asset_name} (${m.asset_tag})</p>
        <p><strong>Issue:</strong> ${m.issue_description}</p>
        <p><strong>Priority:</strong> <span class="badge badge-${m.priority.toLowerCase()}">${m.priority}</span></p>
        <p><strong>Status:</strong> <span class="badge badge-${m.status.toLowerCase().replace(' ', '-')}">${m.status}</span></p>
        <p><strong>Requested By:</strong> ${m.requested_by_name}</p>
        ${m.approved_by_name ? `<p><strong>Approved By:</strong> ${m.approved_by_name}</p>` : ''}
        ${m.resolution_notes ? `<p><strong>Resolution:</strong> ${m.resolution_notes}</p>` : ''}
      `);
    } catch (err) {}
  },

  // Audit
  async showAudit() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Asset Audit</h1>
        <p>Run structured verification cycles</p>
      </div>
      <div class="quick-actions">
        <button class="btn btn-primary" onclick="app.showAuditModal()">+ Create Audit Cycle</button>
      </div>
      <div id="audit-list"></div>
    `;
    await this.loadAudits();
  },

  async loadAudits() {
    try {
      const audits = await api.get('/audits');
      const container = document.getElementById('audit-list');
      container.innerHTML = audits.map(a => `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">${a.name}</h3>
              <p style="font-size:13px; margin-top:4px;">${a.department_name || 'All Departments'} • ${a.status}</p>
            </div>
            <div style="display:flex; gap:8px;">
              ${a.status === 'Open' ? `<button class="btn btn-primary btn-sm" onclick="app.viewAudit(${a.id})">Conduct Audit</button>` : ''}
              ${a.status === 'Open' ? `<button class="btn btn-secondary btn-sm" onclick="app.closeAudit(${a.id})">Close Cycle</button>` : ''}
            </div>
          </div>
          <p><strong>Date Range:</strong> ${a.start_date} to ${a.end_date}</p>
          <p><strong>Created By:</strong> ${a.created_by_name || '—'}</p>
        </div>
      `).join('');
    } catch (err) { document.getElementById('audit-list').innerHTML = `<div class="card">Error: ${err.message}</div>`; }
  },

  showAuditModal() {
    this.showModal('Create Audit Cycle', `
      <form id="audit-form">
        <div class="form-group"><label>Name</label><input type="text" id="au-name" required></div>
        <div class="form-row">
          <div class="form-group"><label>Department ID (optional)</label><input type="number" id="au-dept"></div>
          <div class="form-group"><label>Location (optional)</label><input type="text" id="au-loc"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Start Date</label><input type="date" id="au-start" required></div>
          <div class="form-group"><label>End Date</label><input type="date" id="au-end" required></div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">Create Cycle</button>
        </div>
      </form>
    `, () => {
      document.getElementById('audit-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await api.post('/audits', {
            name: document.getElementById('au-name').value,
            scope_department_id: document.getElementById('au-dept').value || null,
            scope_location: document.getElementById('au-loc').value,
            start_date: document.getElementById('au-start').value,
            end_date: document.getElementById('au-end').value
          });
          this.showToast('Audit cycle created', 'success');
          this.closeModal();
          await this.loadAudits();
        } catch (err) { this.showToast(err.message, 'error'); }
      };
    });
  },

  async viewAudit(id) {
    try {
      const items = await api.get(`/audits/${id}/items`);
      this.showModal('Audit Checklist', `
        <div class="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              ${items.map(i => `
                <tr>
                  <td>${i.asset_name} (${i.asset_tag})</td>
                  <td>${i.location || '—'}</td>
                  <td><span class="badge badge-${i.status.toLowerCase()}">${i.status}</span></td>
                  <td>
                    <button class="btn btn-sm btn-success" onclick="app.verifyAuditItem(${id}, ${i.id}, 'Verified')">✓ Verified</button>
                    <button class="btn btn-sm btn-warning" onclick="app.verifyAuditItem(${id}, ${i.id}, 'Damaged')">Damaged</button>
                    <button class="btn btn-sm btn-danger" onclick="app.verifyAuditItem(${id}, ${i.id}, 'Missing')">Missing</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async verifyAuditItem(auditId, itemId, status) {
    const notes = prompt('Notes (optional):') || '';
    try {
      await api.put(`/audits/${auditId}/items/${itemId}`, { status, notes });
      this.showToast(`Marked as ${status}`, 'success');
      await this.viewAudit(auditId);
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  async closeAudit(id) {
    if (!confirm('Close this audit cycle? Discrepancy report will be generated.')) return;
    try {
      const res = await api.put(`/audits/${id}/close`);
      this.showToast(`Audit closed. ${res.discrepancies} discrepancies found.`, 'success');
      await this.loadAudits();
    } catch (err) { this.showToast(err.message, 'error'); }
  },

  // Reports
  async showReports() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Reports & Analytics</h1>
        <p>Utilization, maintenance frequency, most-used/idle, booking heatmap</p>
      </div>
      <div class="kpi-grid">
        <div class="card" style="grid-column: span 2;">
          <h3 class="card-title" style="margin-bottom:16px;">Utilization by Department</h3>
          <canvas id="util-chart"></canvas>
        </div>
        <div class="card" style="grid-column: span 2;">
          <h3 class="card-title" style="margin-bottom:16px;">Maintenance Frequency</h3>
          <canvas id="maint-chart"></canvas>
        </div>
      </div>
      <div class="kpi-grid">
        <div class="card">
          <h3 class="card-title" style="margin-bottom:16px;">Most Used Assets</h3>
          <div id="most-used"></div>
        </div>
        <div class="card">
          <h3 class="card-title" style="margin-bottom:16px;">Idle Assets</h3>
          <div id="idle-assets"></div>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">Booking Heatmap (Peak Hours)</h3>
        <canvas id="heatmap-chart"></canvas>
      </div>
      <div class="card">
        <h3 class="card-title" style="margin-bottom:16px;">Assets Due for Maintenance</h3>
        <div id="due-maint"></div>
      </div>
      <div style="text-align:center; margin-top:24px;">
        <button class="btn btn-primary" onclick="app.exportReport()">Export Report</button>
      </div>
    `;
    
    try {
      const utilData = await api.get('/reports/utilization');
      const maintData = await api.get('/reports/maintenance');
      const bookData = await api.get('/reports/bookings');
      
      new Chart(document.getElementById('util-chart'), {
        type: 'bar',
        data: {
          labels: utilData.departmentUtilization.map(d => d.department),
          datasets: [{ label: 'Allocated Assets', data: utilData.departmentUtilization.map(d => d.count), backgroundColor: '#aa3bff' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
      
      new Chart(document.getElementById('maint-chart'), {
        type: 'line',
        data: {
          labels: maintData.frequency.map(f => f.month),
          datasets: [{ label: 'Requests', data: maintData.frequency.map(f => f.count), borderColor: '#aa3bff', tension: 0.3 }]
        },
        options: { responsive: true }
      });
      
      document.getElementById('most-used').innerHTML = utilData.mostUsed.length ? `
        <ul style="list-style:none; padding:0; margin:0;">
          ${utilData.mostUsed.map(a => `<li style="padding:8px 0; border-bottom:1px solid var(--border);"><strong>${a.asset_tag}</strong> — ${a.name} <span style="float:right; color:var(--accent);">${a.allocation_count} allocations</span></li>`).join('')}
        </ul>
      ` : '<p style="color:var(--text);">No data available</p>';
      
      document.getElementById('idle-assets').innerHTML = utilData.idleAssets.length ? `
        <ul style="list-style:none; padding:0; margin:0;">
          ${utilData.idleAssets.map(a => `<li style="padding:8px 0; border-bottom:1px solid var(--border);"><strong>${a.asset_tag}</strong> — ${a.name} <span style="float:right; color:var(--text);">${a.location}</span></li>`).join('')}
        </ul>
      ` : '<p style="color:var(--text);">No idle assets</p>';
      
      document.getElementById('due-maint').innerHTML = maintData.dueSoon.length ? `
        <ul style="list-style:none; padding:0; margin:0;">
          ${maintData.dueSoon.map(a => `<li style="padding:8px 0; border-bottom:1px solid var(--border);"><strong>${a.asset_tag}</strong> — ${a.name}</li>`).join('')}
        </ul>
      ` : '<p style="color:var(--text);">No assets due for maintenance</p>';
      
      new Chart(document.getElementById('heatmap-chart'), {
        type: 'bar',
        data: {
          labels: bookData.heatmap.map(h => `${h.hour}:00`),
          datasets: [{ label: 'Bookings', data: bookData.heatmap.map(h => h.count), backgroundColor: '#aa3bff' }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    } catch (err) {
      content.innerHTML += `<div class="card" style="margin-top:24px;">Error loading reports: ${err.message}</div>`;
    }
  },

  exportReport() {
    this.showToast('Report export started (demo functionality)', 'success');
  },

  // Notifications
  async showNotifications() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="content-header">
        <h1>Activity Logs & Notifications</h1>
        <p>Stay informed without digging for updates</p>
      </div>
      <div class="tabs">
        <div class="tab active" onclick="app.switchNotifTab('all', this)">All</div>
        <div class="tab" onclick="app.switchNotifTab('alerts', this)">Alerts</div>
        <div class="tab" onclick="app.switchNotifTab('approvals', this)">Approvals</div>
        <div class="tab" onclick="app.switchNotifTab('bookings', this)">Bookings</div>
      </div>
      <div id="notif-content"></div>
      <div class="card" style="margin-top:24px;">
        <h3 class="card-title" style="margin-bottom:16px;">Activity Log</h3>
        <div id="activity-log-content"></div>
      </div>
    `;
    await this.loadNotifications('all');
    await this.loadActivityLog();
  },

  async switchNotifTab(type, el) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    await this.loadNotifications(type);
  },

  async loadNotifications(filter) {
    try {
      const notifs = await api.get('/notifications');
      const filtered = filter === 'all' ? notifs : notifs.filter(n => n.type.toLowerCase().includes(filter));
      const container = document.getElementById('notif-content');
      container.innerHTML = filtered.length ? filtered.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="app.markRead(${n.id})">
          <div class="notification-dot ${n.is_read ? 'read' : ''}"></div>
          <div>
            <div style="font-weight:500; color:var(--text-h); margin-bottom:2px;">${n.type}</div>
            <div style="font-size:14px; margin-bottom:4px;">${n.message}</div>
            <div style="font-size:12px; color:var(--text);">${new Date(n.created_at).toLocaleString()}</div>
          </div>
        </div>
      `).join('') : '<p style="color:var(--text); padding:20px;">No notifications</p>';
    } catch (err) {}
  },

  async markRead(id) {
    try {
      await api.put(`/notifications/${id}/read`);
      await this.loadNotifications('all');
    } catch (err) {}
  },

  async loadActivityLog() {
    try {
      const logs = await api.get('/activity-logs');
      document.getElementById('activity-log-content').innerHTML = logs.length ? `
        <div class="activity-list">
          ${logs.map(l => `
            <div class="activity-item">
              <div class="activity-icon">◈</div>
              <div class="activity-content">
                <div class="title">${l.action}</div>
                <div>${l.details || ''}</div>
                <div class="time">${new Date(l.created_at).toLocaleString()} by ${l.user_name || 'System'}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text);">No activity logs</p>';
    } catch (err) {}
  },

  // Utilities
  showModal(title, body, onShow) {
    const overlay = document.getElementById('modal-overlay');
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="modal-close" onclick="app.closeModal()">×</button>
        </div>
        <div class="modal-body">${body}</div>
      </div>
    `;
    overlay.classList.remove('hidden');
    if (onShow) onShow();
  },

  closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }
};

app.init();