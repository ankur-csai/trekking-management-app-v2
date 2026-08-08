// app.js — the entire Vue frontend. Options API (data/methods/computed),
// loaded via CDN (no build step). One file, like the MAD1 project, so it's
// easy to explain end-to-end.
//
// STRUCTURE:
//   1. A tiny global "store" (just a reactive object) holding the logged-in user
//   2. One component per page (login, register, admin/staff/user pages)
//   3. Vue Router wiring URLs -> components, with a role-based navigation guard
//   4. The root App component (navbar + <router-view>) that boots everything

const { createApp, reactive } = Vue;
const { createRouter, createWebHistory } = VueRouter;

// -----------------------------------------------------------------------
// 1. GLOBAL STORE — just a reactive object every component can read/write.
//    Small enough that we don't need Vuex/Pinia for this project.
// -----------------------------------------------------------------------
const store = reactive({
  user: null,          // null = logged out; otherwise {id, name, role, ...}
});

async function refreshUser() {
  try {
    store.user = await api.get('/api/auth/me');
  } catch (e) {
    store.user = null;
  }
}

// -----------------------------------------------------------------------
// 2. PAGE COMPONENTS
// -----------------------------------------------------------------------

const LoginPage = {
  data() { return { email: '', password: '', error: '' }; },
  methods: {
    async submit() {
      this.error = '';
      try {
        const res = await api.post('/api/auth/login', { email: this.email, password: this.password });
        store.user = res.user;
        if (res.user.role === 'admin') this.$router.push('/admin');
        else if (res.user.role === 'staff') this.$router.push('/staff');
        else this.$router.push('/user');
      } catch (e) { this.error = e.message; }
    }
  },
  template: `
    <div class="row justify-content-center mt-5">
      <div class="col-md-5">
        <div class="card shadow-sm"><div class="card-body">
          <h3 class="text-center mb-3">Login</h3>
          <div v-if="error" class="alert alert-danger">{{ error }}</div>
          <form @submit.prevent="submit">
            <input class="form-control mb-2" type="email" v-model="email" placeholder="Email" required>
            <input class="form-control mb-3" type="password" v-model="password" placeholder="Password" required>
            <button class="btn btn-primary w-100">Login</button>
          </form>
          <p class="text-center mt-3 mb-0">No account?
            <router-link to="/register">Register here</router-link>
          </p>
        </div></div>
      </div>
    </div>`
};

const RegisterPage = {
  data() { return { name: '', email: '', password: '', contact: '', error: '', success: '' }; },
  methods: {
    async submit() {
      this.error = ''; this.success = '';
      try {
        await api.post('/api/auth/register', {
          name: this.name, email: this.email, password: this.password, contact: this.contact
        });
        this.success = 'Registered! Redirecting to login...';
        setTimeout(() => this.$router.push('/login'), 1200);
      } catch (e) { this.error = e.message; }
    }
  },
  template: `
    <div class="row justify-content-center mt-5">
      <div class="col-md-5">
        <div class="card shadow-sm"><div class="card-body">
          <h3 class="text-center mb-3">Register as Trekker</h3>
          <div v-if="error" class="alert alert-danger">{{ error }}</div>
          <div v-if="success" class="alert alert-success">{{ success }}</div>
          <form @submit.prevent="submit">
            <input class="form-control mb-2" v-model="name" placeholder="Full Name" required>
            <input class="form-control mb-2" type="email" v-model="email" placeholder="Email" required>
            <input class="form-control mb-2" type="password" v-model="password" placeholder="Password" required>
            <input class="form-control mb-3" v-model="contact" placeholder="Contact (optional)">
            <button class="btn btn-success w-100">Register</button>
          </form>
          <p class="text-center mt-3 mb-0">Already have an account?
            <router-link to="/login">Login here</router-link>
          </p>
        </div></div>
      </div>
    </div>`
};

// ---- ADMIN PAGES -------------------------------------------------------

const AdminDashboard = {
  data() { return { stats: null }; },
  async created() { this.stats = await api.get('/api/admin/dashboard'); },
  template: `
    <div v-if="stats">
      <h3 class="mb-4">Admin Dashboard</h3>
      <div class="row g-3 mb-4">
        <div class="col-md-3"><div class="card text-center p-3"><h6>Total Treks</h6><h2>{{ stats.treks }}</h2></div></div>
        <div class="col-md-3"><div class="card text-center p-3"><h6>Total Users</h6><h2>{{ stats.users }}</h2></div></div>
        <div class="col-md-3"><div class="card text-center p-3"><h6>Total Staff</h6><h2>{{ stats.staff }}</h2></div></div>
        <div class="col-md-3"><div class="card text-center p-3"><h6>Total Bookings</h6><h2>{{ stats.bookings }}</h2></div></div>
      </div>
      <div class="card"><div class="card-body">
        <h5>Recent Bookings</h5>
        <table class="table table-sm">
          <thead><tr><th>ID</th><th>User</th><th>Trek</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="b in stats.recent_bookings" :key="b.id">
              <td>{{ b.id }}</td><td>{{ b.user_name }}</td><td>{{ b.trek_name }}</td>
              <td>{{ b.booking_date }}</td><td>{{ b.status }}</td>
            </tr>
            <tr v-if="!stats.recent_bookings.length"><td colspan="5" class="text-muted">No bookings yet.</td></tr>
          </tbody>
        </table>
      </div></div>
    </div>`
};

const AdminTreks = {
  data() { return { treks: [], staffList: [], q: '' }; },
  async created() { await this.load(); this.staffList = await api.get('/api/admin/staff'); },
  methods: {
    async load() { this.treks = await api.get('/api/admin/treks' + (this.q ? '?q=' + encodeURIComponent(this.q) : '')); },
    async remove(id) {
      if (!confirm('Delete this trek?')) return;
      await api.del('/api/admin/treks/' + id);
      await this.load();
    }
  },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>Treks</h3>
        <router-link class="btn btn-primary" to="/admin/treks/add">+ Add New Trek</router-link>
      </div>
      <form class="mb-3" @submit.prevent="load">
        <input class="form-control" v-model="q" placeholder="Search treks by name or ID...">
      </form>
      <table class="table table-bordered bg-white">
        <thead><tr><th>ID</th><th>Name</th><th>Location</th><th>Difficulty</th><th>Slots</th><th>Status</th><th>Staff</th><th>Actions</th></tr></thead>
        <tbody>
          <tr v-for="t in treks" :key="t.id">
            <td>{{ t.id }}</td><td>{{ t.name }}</td><td>{{ t.location }}</td><td>{{ t.difficulty }}</td>
            <td>{{ t.available_slots }}</td><td>{{ t.status }}</td><td>{{ t.staff_name || '-' }}</td>
            <td>
              <router-link class="btn btn-sm btn-outline-primary" :to="'/admin/treks/edit/' + t.id">Edit</router-link>
              <button class="btn btn-sm btn-outline-danger" @click="remove(t.id)">Delete</button>
            </td>
          </tr>
          <tr v-if="!treks.length"><td colspan="8" class="text-muted">No treks found.</td></tr>
        </tbody>
      </table>
    </div>`
};

const TrekForm = {
  // Shared by BOTH /admin/treks/add and /admin/treks/edit/:id — same
  // pattern as the MAD1 trek_form.html: one template, two jobs.
  data() {
    return {
      isEdit: !!this.$route.params.id,
      staffList: [],
      trek: { name: '', location: '', difficulty: 'Easy', duration: 0, available_slots: 0,
              status: 'Pending', start_date: '', end_date: '', description: '', assigned_staff_id: '' }
    };
  },
  async created() {
    this.staffList = await api.get('/api/admin/staff');
    if (this.isEdit) {
      const all = await api.get('/api/admin/treks');
      const found = all.find(t => t.id == this.$route.params.id);
      if (found) this.trek = { ...found, assigned_staff_id: found.assigned_staff_id || '' };
    }
  },
  methods: {
    async save() {
      if (this.isEdit) await api.put('/api/admin/treks/' + this.$route.params.id, this.trek);
      else await api.post('/api/admin/treks', this.trek);
      this.$router.push('/admin/treks');
    }
  },
  template: `
    <div>
      <h3>{{ isEdit ? 'Edit Trek' : 'Add New Trek' }}</h3>
      <div class="card"><div class="card-body">
        <form @submit.prevent="save">
          <div class="row g-3">
            <div class="col-md-6"><label class="form-label">Trek Name</label>
              <input class="form-control" v-model="trek.name" required></div>
            <div class="col-md-6"><label class="form-label">Location</label>
              <input class="form-control" v-model="trek.location" required></div>
            <div class="col-md-4"><label class="form-label">Difficulty</label>
              <select class="form-select" v-model="trek.difficulty">
                <option>Easy</option><option>Moderate</option><option>Hard</option>
              </select></div>
            <div class="col-md-4"><label class="form-label">Duration (days)</label>
              <input class="form-control" type="number" v-model.number="trek.duration"></div>
            <div class="col-md-4"><label class="form-label">Available Slots</label>
              <input class="form-control" type="number" v-model.number="trek.available_slots"></div>
            <div class="col-md-4"><label class="form-label">Start Date</label>
              <input class="form-control" type="date" v-model="trek.start_date"></div>
            <div class="col-md-4"><label class="form-label">End Date</label>
              <input class="form-control" type="date" v-model="trek.end_date"></div>
            <div class="col-md-4"><label class="form-label">Status</label>
              <select class="form-select" v-model="trek.status">
                <option>Pending</option><option>Approved</option><option>Open</option>
                <option>Closed</option><option>Completed</option>
              </select></div>
            <div class="col-md-6"><label class="form-label">Assign Staff</label>
              <select class="form-select" v-model="trek.assigned_staff_id">
                <option value="">-- None --</option>
                <option v-for="s in staffList" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select></div>
            <div class="col-12"><label class="form-label">Description</label>
              <textarea class="form-control" v-model="trek.description"></textarea></div>
          </div>
          <div class="mt-3">
            <router-link class="btn btn-secondary" to="/admin/treks">Cancel</router-link>
            <button class="btn btn-primary">Save</button>
          </div>
        </form>
      </div></div>
    </div>`
};

const AdminStaff = {
  data() { return { staff: [], q: '', showForm: false, newStaff: { name: '', email: '', password: '', contact: '' } }; },
  async created() { await this.load(); },
  methods: {
    async load() { this.staff = await api.get('/api/admin/staff' + (this.q ? '?q=' + encodeURIComponent(this.q) : '')); },
    async createStaff() {
      await api.post('/api/admin/staff', this.newStaff);
      this.newStaff = { name: '', email: '', password: '', contact: '' };
      this.showForm = false;
      await this.load();
    },
    async toggle(id) { await api.post('/api/admin/staff/' + id + '/toggle'); await this.load(); }
  },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3>Trekking Staff</h3>
        <button class="btn btn-primary" @click="showForm = !showForm">+ Add New Staff</button>
      </div>
      <div v-if="showForm" class="card mb-3"><div class="card-body">
        <h5>Create New Trekking Staff</h5>
        <form @submit.prevent="createStaff" class="row g-2">
          <div class="col-md-6"><input class="form-control" v-model="newStaff.name" placeholder="Full Name" required></div>
          <div class="col-md-6"><input class="form-control" type="email" v-model="newStaff.email" placeholder="Email" required></div>
          <div class="col-md-6"><input class="form-control" type="password" v-model="newStaff.password" placeholder="Password" required></div>
          <div class="col-md-6"><input class="form-control" v-model="newStaff.contact" placeholder="Contact"></div>
          <div class="col-12"><button class="btn btn-success">Create Staff</button></div>
        </form>
      </div></div>
      <form class="mb-3" @submit.prevent="load">
        <input class="form-control" v-model="q" placeholder="Search staff by name or ID...">
      </form>
      <table class="table table-bordered bg-white">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Contact</th><th>Active?</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="s in staff" :key="s.id">
            <td>{{ s.id }}</td><td>{{ s.name }}</td><td>{{ s.email }}</td><td>{{ s.contact || '-' }}</td>
            <td>{{ s.is_active ? 'Yes' : 'Blacklisted' }}</td>
            <td><button class="btn btn-sm btn-outline-danger" @click="toggle(s.id)">
              {{ s.is_active ? 'Blacklist' : 'Un-blacklist' }}
            </button></td>
          </tr>
          <tr v-if="!staff.length"><td colspan="6" class="text-muted">No staff found.</td></tr>
        </tbody>
      </table>
    </div>`
};

const AdminUsers = {
  data() { return { users: [], q: '' }; },
  async created() { await this.load(); },
  methods: {
    async load() { this.users = await api.get('/api/admin/users' + (this.q ? '?q=' + encodeURIComponent(this.q) : '')); },
    async toggle(id) { await api.post('/api/admin/users/' + id + '/toggle'); await this.load(); }
  },
  template: `
    <div>
      <h3 class="mb-3">Users (Trekkers)</h3>
      <form class="mb-3" @submit.prevent="load">
        <input class="form-control" v-model="q" placeholder="Search users by name or ID...">
      </form>
      <table class="table table-bordered bg-white">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Contact</th><th>Active?</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td>{{ u.id }}</td><td>{{ u.name }}</td><td>{{ u.email }}</td><td>{{ u.contact || '-' }}</td>
            <td>{{ u.is_active ? 'Yes' : 'Blacklisted' }}</td>
            <td><button class="btn btn-sm btn-outline-danger" @click="toggle(u.id)">
              {{ u.is_active ? 'Blacklist' : 'Un-blacklist' }}
            </button></td>
          </tr>
          <tr v-if="!users.length"><td colspan="6" class="text-muted">No users found.</td></tr>
        </tbody>
      </table>
    </div>`
};

const AdminBookings = {
  data() { return { bookings: [] }; },
  async created() { this.bookings = await api.get('/api/admin/bookings'); },
  template: `
    <div>
      <h3 class="mb-3">All Bookings</h3>
      <table class="table table-bordered bg-white">
        <thead><tr><th>ID</th><th>User</th><th>Trek</th><th>Date</th><th>Status</th><th>Payment</th></tr></thead>
        <tbody>
          <tr v-for="b in bookings" :key="b.id">
            <td>{{ b.id }}</td><td>{{ b.user_name }}</td><td>{{ b.trek_name }}</td>
            <td>{{ b.booking_date }}</td><td>{{ b.status }}</td><td>{{ b.payment_status }}</td>
          </tr>
          <tr v-if="!bookings.length"><td colspan="6" class="text-muted">No bookings yet.</td></tr>
        </tbody>
      </table>
    </div>`
};

// ---- STAFF PAGES ---------------------------------------------------------

const StaffDashboard = {
  data() { return { treks: [], counts: {}, total_participants: 0, open_count: 0 }; },
  async created() {
    const d = await api.get('/api/staff/dashboard');
    this.treks = d.treks; this.counts = d.counts;
    this.total_participants = d.total_participants; this.open_count = d.open_count;
  },
  template: `
    <div>
      <h3 class="mb-4">My Dashboard</h3>
      <div class="row g-3 mb-4">
        <div class="col-md-4"><div class="card text-center p-3"><h6>Assigned Treks</h6><h2>{{ treks.length }}</h2></div></div>
        <div class="col-md-4"><div class="card text-center p-3"><h6>Total Participants</h6><h2>{{ total_participants }}</h2></div></div>
        <div class="col-md-4"><div class="card text-center p-3"><h6>Open Treks</h6><h2>{{ open_count }}</h2></div></div>
      </div>
      <table class="table table-bordered bg-white">
        <thead><tr><th>Name</th><th>Location</th><th>Participants</th><th>Slots</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="t in treks" :key="t.id">
            <td>{{ t.name }}</td><td>{{ t.location }}</td><td>{{ counts[t.id] }}</td>
            <td>{{ t.available_slots }}</td><td>{{ t.status }}</td>
            <td><router-link class="btn btn-sm btn-primary" :to="'/staff/trek/' + t.id">Manage</router-link></td>
          </tr>
          <tr v-if="!treks.length"><td colspan="6" class="text-muted">No treks assigned to you yet.</td></tr>
        </tbody>
      </table>
    </div>`
};

const StaffManageTrek = {
  data() { return { trek: null, participants: [], slots: 0, status: 'Open' }; },
  async created() { await this.load(); },
  methods: {
    async load() {
      const d = await api.get('/api/staff/treks/' + this.$route.params.id);
      this.trek = d.trek; this.participants = d.participants;
      this.slots = d.trek.available_slots; this.status = d.trek.status;
    },
    async save() {
      await api.put('/api/staff/treks/' + this.$route.params.id, { available_slots: this.slots, status: this.status });
      await this.load();
    },
    async mark(newStatus) {
      await api.post('/api/staff/treks/' + this.$route.params.id + '/mark/' + newStatus);
      await this.load();
    }
  },
  template: `
    <div v-if="trek">
      <h3>{{ trek.name }}</h3>
      <div class="row">
        <div class="col-md-5">
          <div class="card mb-3"><div class="card-body">
            <p class="mb-1">Location: {{ trek.location }}</p>
            <p class="mb-1">Difficulty: {{ trek.difficulty }}</p>
            <p class="mb-1">Duration: {{ trek.duration }} days</p>
            <label class="form-label mt-2">Available Slots</label>
            <input class="form-control mb-2" type="number" v-model.number="slots">
            <label class="form-label">Status</label>
            <select class="form-select mb-3" v-model="status">
              <option>Open</option><option>Closed</option>
            </select>
            <button class="btn btn-primary w-100" @click="save">Save</button>
            <hr>
            <button class="btn btn-sm btn-success me-1" @click="mark('Open')">Mark Started (Open)</button>
            <button class="btn btn-sm btn-dark" @click="mark('Completed')">Mark Completed</button>
          </div></div>
        </div>
        <div class="col-md-7">
          <div class="card"><div class="card-body">
            <h5>Participants ({{ participants.length }})</h5>
            <table class="table table-sm">
              <thead><tr><th>Name</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="p in participants" :key="p.id">
                  <td>{{ p.user_name }}</td><td>{{ p.booking_date }}</td><td>{{ p.status }}</td>
                </tr>
                <tr v-if="!participants.length"><td colspan="3" class="text-muted">No participants yet.</td></tr>
              </tbody>
            </table>
          </div></div>
        </div>
      </div>
      <router-link class="btn btn-link mt-3" to="/staff">&larr; Back to my treks</router-link>
    </div>`
};

// ---- TREKKER (USER) PAGES ------------------------------------------------

const UserDashboard = {
  data() { return { treks: [], bookings: [], difficulty: '', location: '' }; },
  async created() { await this.loadTreks(); this.bookings = await api.get('/api/user/bookings'); },
  computed: {
    bookedTrekIds() { return this.bookings.filter(b => b.status !== 'Cancelled').map(b => b.trek_id); }
  },
  methods: {
    async loadTreks() {
      const params = new URLSearchParams();
      if (this.difficulty) params.set('difficulty', this.difficulty);
      if (this.location) params.set('location', this.location);
      this.treks = await api.get('/api/user/treks' + (params.toString() ? '?' + params : ''));
    },
    async book(id) {
      try { await api.post('/api/user/treks/' + id + '/book'); await this.loadTreks(); this.bookings = await api.get('/api/user/bookings'); }
      catch (e) { alert(e.message); }
    }
  },
  template: `
    <div>
      <h3 class="mb-3">Welcome, {{ store.user.name }}!</h3>
      <h5>Available Treks</h5>
      <form class="row g-2 mb-3" @submit.prevent="loadTreks">
        <div class="col-auto">
          <select class="form-select" v-model="difficulty" @change="loadTreks">
            <option value="">Difficulty: All</option>
            <option>Easy</option><option>Moderate</option><option>Hard</option>
          </select>
        </div>
        <div class="col-auto"><input class="form-control" v-model="location" placeholder="Location"></div>
        <div class="col-auto"><button class="btn btn-outline-secondary">Filter</button></div>
      </form>
      <table class="table table-bordered bg-white">
        <thead><tr><th>Name</th><th>Location</th><th>Difficulty</th><th>Duration</th><th>Slots</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="t in treks" :key="t.id">
            <td>{{ t.name }}</td><td>{{ t.location }}</td><td>{{ t.difficulty }}</td>
            <td>{{ t.duration }} days</td><td>{{ t.available_slots }}</td>
            <td>
              <router-link class="btn btn-sm btn-outline-primary" :to="'/user/trek/' + t.id">Details</router-link>
              <span v-if="bookedTrekIds.includes(t.id)" class="badge bg-secondary">Booked</span>
              <button v-else-if="t.available_slots > 0" class="btn btn-sm btn-success" @click="book(t.id)">Book Now</button>
              <span v-else class="badge bg-danger">Full</span>
            </td>
          </tr>
          <tr v-if="!treks.length"><td colspan="6" class="text-muted">No open treks match your filter.</td></tr>
        </tbody>
      </table>
    </div>`
};

const UserTrekDetail = {
  data() { return { trek: null }; },
  async created() { this.trek = await api.get('/api/user/treks/' + this.$route.params.id); },
  methods: {
    async book() {
      try { await api.post('/api/user/treks/' + this.trek.id + '/book'); this.$router.push('/user/bookings'); }
      catch (e) { alert(e.message); }
    }
  },
  template: `
    <div v-if="trek">
      <router-link class="btn btn-link" to="/user">&larr; Back to Treks</router-link>
      <h3>{{ trek.name }}</h3>
      <div class="card"><div class="card-body">
        <p class="mb-1">Location: {{ trek.location }}</p>
        <p class="mb-1">Difficulty: {{ trek.difficulty }}</p>
        <p class="mb-1">Duration: {{ trek.duration }} days</p>
        <p class="mb-1">Available Slots: {{ trek.available_slots }}</p>
        <p class="mb-1">Status: {{ trek.status }}</p>
        <hr><p>{{ trek.description || 'No description.' }}</p>
        <button v-if="trek.status === 'Open' && trek.available_slots > 0" class="btn btn-success" @click="book">Book Now</button>
        <button v-else class="btn btn-secondary" disabled>Not available</button>
      </div></div>
    </div>`
};

const UserBookings = {
  data() { return { bookings: [] }; },
  async created() { this.bookings = await api.get('/api/user/bookings'); },
  methods: {
    async cancel(id) {
      if (!confirm('Cancel this booking?')) return;
      await api.post('/api/user/bookings/' + id + '/cancel');
      this.bookings = await api.get('/api/user/bookings');
    }
  },
  template: `
    <div>
      <h3 class="mb-3">My Bookings</h3>
      <table class="table table-bordered bg-white">
        <thead><tr><th>Trek</th><th>Date</th><th>Status</th><th>Payment</th><th>Action</th></tr></thead>
        <tbody>
          <tr v-for="b in bookings" :key="b.id">
            <td>{{ b.trek_name }}</td><td>{{ b.booking_date }}</td><td>{{ b.status }}</td><td>{{ b.payment_status }}</td>
            <td><button v-if="b.status === 'Booked'" class="btn btn-sm btn-outline-danger" @click="cancel(b.id)">Cancel</button></td>
          </tr>
          <tr v-if="!bookings.length"><td colspan="5" class="text-muted">You have no bookings.</td></tr>
        </tbody>
      </table>
    </div>`
};

const UserHistory = {
  data() { return { history: [] }; },
  async created() { this.history = await api.get('/api/user/history'); },
  template: `
    <div>
      <h3 class="mb-3">Trekking History</h3>
      <table class="table table-bordered bg-white">
        <thead><tr><th>Trek</th><th>Date</th><th>Status</th></tr></thead>
        <tbody>
          <tr v-for="b in history" :key="b.id"><td>{{ b.trek_name }}</td><td>{{ b.booking_date }}</td><td>{{ b.status }}</td></tr>
          <tr v-if="!history.length"><td colspan="3" class="text-muted">No past treks yet.</td></tr>
        </tbody>
      </table>
    </div>`
};

const UserProfile = {
  data() { return { name: '', contact: '', email: '', exportState: '' }; },
  async created() {
    const me = await api.get('/api/user/profile');
    this.name = me.name; this.contact = me.contact || ''; this.email = me.email;
  },
  methods: {
    async save() {
      const updated = await api.put('/api/user/profile', { name: this.name, contact: this.contact });
      store.user.name = updated.name;
    },
    async exportCsv() {
      this.exportState = 'starting...';
      const { task_id } = await api.post('/api/user/export');
      const poll = setInterval(async () => {
        const r = await api.get('/api/user/export/status/' + task_id);
        this.exportState = r.state;
        if (r.state === 'SUCCESS') {
          clearInterval(poll);
          window.location.href = '/exports/' + r.filename;   // triggers download
        }
      }, 1500);
    }
  },
  template: `
    <div class="row justify-content-center">
      <div class="col-md-6">
        <div class="card"><div class="card-body">
          <h3 class="mb-3">My Profile</h3>
          <label class="form-label">Name</label>
          <input class="form-control mb-2" v-model="name">
          <label class="form-label">Email (cannot change)</label>
          <input class="form-control mb-2" :value="email" disabled>
          <label class="form-label">Contact</label>
          <input class="form-control mb-3" v-model="contact">
          <button class="btn btn-primary w-100" @click="save">Update Profile</button>
          <hr>
          <h5>Export Booking History</h5>
          <button class="btn btn-outline-secondary w-100" @click="exportCsv">Export as CSV</button>
          <p v-if="exportState" class="text-muted mt-2">Status: {{ exportState }}</p>
        </div></div>
      </div>
    </div>`
};

// -----------------------------------------------------------------------
// 3. ROUTER — maps URLs to components. `meta.roles` drives the access guard.
// -----------------------------------------------------------------------
const routes = [
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegisterPage },

  { path: '/admin', component: AdminDashboard, meta: { roles: ['admin'] } },
  { path: '/admin/treks', component: AdminTreks, meta: { roles: ['admin'] } },
  { path: '/admin/treks/add', component: TrekForm, meta: { roles: ['admin'] } },
  { path: '/admin/treks/edit/:id', component: TrekForm, meta: { roles: ['admin'] } },
  { path: '/admin/staff', component: AdminStaff, meta: { roles: ['admin'] } },
  { path: '/admin/users', component: AdminUsers, meta: { roles: ['admin'] } },
  { path: '/admin/bookings', component: AdminBookings, meta: { roles: ['admin'] } },

  { path: '/staff', component: StaffDashboard, meta: { roles: ['staff'] } },
  { path: '/staff/trek/:id', component: StaffManageTrek, meta: { roles: ['staff'] } },

  { path: '/user', component: UserDashboard, meta: { roles: ['trekker'] } },
  { path: '/user/trek/:id', component: UserTrekDetail, meta: { roles: ['trekker'] } },
  { path: '/user/bookings', component: UserBookings, meta: { roles: ['trekker'] } },
  { path: '/user/history', component: UserHistory, meta: { roles: ['trekker'] } },
  { path: '/user/profile', component: UserProfile, meta: { roles: ['trekker'] } },

  { path: '/', redirect: '/login' },
];

const router = createRouter({ history: createWebHistory(), routes });

// The navigation guard — same JOB as the @login_required / @role_required
// decorators in app.py, just running in the browser before a page renders.
router.beforeEach((to) => {
  if (!to.meta.roles) return true;                 // public route (login/register)
  if (!store.user) return '/login';                 // not logged in
  if (!to.meta.roles.includes(store.user.role)) {
    // logged in but wrong role -> bounce to THEIR home page
    return '/' + store.user.role.replace('trekker', 'user');
  }
  return true;
});

// -----------------------------------------------------------------------
// 4. ROOT APP — navbar (role-aware, like base.html) + <router-view>
// -----------------------------------------------------------------------
const App = {
  data() { return { store }; },
  methods: {
    async logout() {
      await api.post('/api/auth/logout');
      store.user = null;
      this.$router.push('/login');
    }
  },
  template: `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark px-3">
      <span class="navbar-brand">Trekking Management</span>
      <div class="navbar-nav me-auto" v-if="store.user">
        <template v-if="store.user.role === 'admin'">
          <router-link class="nav-link" to="/admin">Dashboard</router-link>
          <router-link class="nav-link" to="/admin/treks">Treks</router-link>
          <router-link class="nav-link" to="/admin/staff">Staff</router-link>
          <router-link class="nav-link" to="/admin/users">Users</router-link>
          <router-link class="nav-link" to="/admin/bookings">Bookings</router-link>
        </template>
        <template v-else-if="store.user.role === 'staff'">
          <router-link class="nav-link" to="/staff">My Treks</router-link>
        </template>
        <template v-else>
          <router-link class="nav-link" to="/user">Browse</router-link>
          <router-link class="nav-link" to="/user/bookings">My Bookings</router-link>
          <router-link class="nav-link" to="/user/history">History</router-link>
          <router-link class="nav-link" to="/user/profile">Profile</router-link>
        </template>
      </div>
      <div class="navbar-nav" v-if="store.user">
        <span class="navbar-text text-white me-3">{{ store.user.name }} ({{ store.user.role }})</span>
        <a class="nav-link" href="#" @click.prevent="logout">Logout</a>
      </div>
    </nav>
    <div class="container my-4"><router-view /></div>`
};

// -----------------------------------------------------------------------
// BOOTSTRAP — check who's logged in (if anyone), THEN mount the app, so the
// router guard above has store.user available on the very first navigation.
// -----------------------------------------------------------------------
(async function bootstrap() {
  await refreshUser();
  const app = createApp(App);
  app.use(router);
  app.mount('#app');
})();
