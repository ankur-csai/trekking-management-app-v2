# app.py — MAD2 Trekking Management API
# =============================================================================
# ARCHITECTURE: Flask serves ONE Jinja entry point (templates/index.html) that
# loads Vue 3 + Vue Router from CDN. Vue then drives the whole UI, calling
# these /api/... endpoints with fetch(). Same-origin, so plain Flask SESSION
# cookies work for auth — no JWT needed. Every API route returns JSON.
#
# Kept as a single file (like the MAD1 project) for viva explainability.
# =============================================================================

from functools import wraps
from datetime import date, datetime, timedelta

from flask import Flask, request, session, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_caching import Cache
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config['SECRET_KEY'] = 'huhui-mad2'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///trek.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# ---- Redis cache config ----------------------------------------------------
# Frequently-hit read endpoint (browsing open treks) is cached here, with an
# expiry, so repeated requests don't hit SQLite every time.
app.config['CACHE_TYPE'] = 'RedisCache'
app.config['CACHE_REDIS_URL'] = 'redis://localhost:6379/0'
app.config['CACHE_DEFAULT_TIMEOUT'] = 60          # seconds — cache expiry

db = SQLAlchemy()
db.init_app(app)
cache = Cache(app)


# =============================================================================
# MODELS  (same 3-table shape as MAD1, extended for V2)
# =============================================================================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(200), nullable=False)      # hash, never plaintext
    role = db.Column(db.String(20), nullable=False)           # 'admin' / 'staff' / 'trekker'
    is_active = db.Column(db.Boolean, default=True)           # blacklist flag
    contact = db.Column(db.String(30))

    bookings = db.relationship('Booking', backref='user', lazy=True)
    assigned_treks = db.relationship('Trek', backref='staff', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'email': self.email,
                'role': self.role, 'is_active': self.is_active, 'contact': self.contact}


class Trek(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    location = db.Column(db.String(120), nullable=False)
    difficulty = db.Column(db.String(20), nullable=False)     # Easy/Moderate/Hard
    duration = db.Column(db.Integer)                          # days
    available_slots = db.Column(db.Integer, default=0)
    status = db.Column(db.String(20), default='Pending')      # Pending/Approved/Open/Closed/Completed
    start_date = db.Column(db.String(20))
    end_date = db.Column(db.String(20))
    description = db.Column(db.Text)
    assigned_staff_id = db.Column(db.Integer, db.ForeignKey('user.id'))

    bookings = db.relationship('Booking', backref='trek', lazy=True)

    def to_dict(self):
        return {'id': self.id, 'name': self.name, 'location': self.location,
                'difficulty': self.difficulty, 'duration': self.duration,
                'available_slots': self.available_slots, 'status': self.status,
                'start_date': self.start_date, 'end_date': self.end_date,
                'description': self.description,
                'assigned_staff_id': self.assigned_staff_id,
                'staff_name': self.staff.name if self.staff else None}


class Booking(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    trek_id = db.Column(db.Integer, db.ForeignKey('trek.id'), nullable=False)
    booking_date = db.Column(db.String(20))
    status = db.Column(db.String(20), default='Booked')       # Booked/Cancelled/Completed
    payment_status = db.Column(db.String(20), default='Paid') # optional field per spec

    def to_dict(self):
        return {'id': self.id, 'user_id': self.user_id, 'trek_id': self.trek_id,
                'user_name': self.user.name, 'trek_name': self.trek.name,
                'booking_date': self.booking_date, 'status': self.status,
                'payment_status': self.payment_status}


# =============================================================================
# AUTH HELPERS — same session pattern as MAD1, but every failure returns JSON
# (never a redirect) since this is a pure API now.
# =============================================================================

def login_required(f):
    @wraps(f)
    def wrapper(*a, **kw):
        if 'user_id' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return f(*a, **kw)
    return wrapper


def role_required(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*a, **kw):
            if session.get('role') not in roles:
                return jsonify({'error': 'Access denied'}), 403
            return f(*a, **kw)
        return wrapper
    return decorator


def current_user():
    if 'user_id' in session:
        return User.query.get(session['user_id'])
    return None


# =============================================================================
# ENTRY POINT — one Jinja-rendered page that boots the Vue app
# =============================================================================

@app.route('/')
@app.route('/<path:_path>')     # let Vue Router own client-side routes too
def index(_path=None):
    return render_template('index.html')


# =============================================================================
# AUTH API
# =============================================================================

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')
    contact = data.get('contact', '')

    if not name or not email or not password:
        return jsonify({'error': 'Name, email and password are required'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    # V2 change: only trekkers self-register. Staff are created BY the admin
    # directly (see /api/admin/staff POST below) — no staff self-signup.
    user = User(name=name, email=email,
               password=generate_password_hash(password),
               role='trekker', is_active=True, contact=contact)
    db.session.add(user)
    db.session.commit()
    return jsonify({'message': 'Registered successfully'}), 201


@app.route('/api/auth/login', methods=['POST'])
def api_login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = User.query.filter_by(email=email).first()

    if not user or not check_password_hash(user.password, password):
        return jsonify({'error': 'Wrong email or password'}), 401
    if not user.is_active:
        return jsonify({'error': 'Account is blacklisted'}), 403

    session['user_id'] = user.id
    session['role'] = user.role
    session['name'] = user.name
    return jsonify({'message': 'Logged in', 'user': user.to_dict()})


@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    session.clear()
    return jsonify({'message': 'Logged out'})


@app.route('/api/auth/me')
def api_me():
    u = current_user()
    return jsonify(u.to_dict() if u else None)


# =============================================================================
# ADMIN API
# =============================================================================

@app.route('/api/admin/dashboard')
@login_required
@role_required('admin')
def admin_dashboard():
    return jsonify({
        'treks': Trek.query.count(),
        'users': User.query.filter_by(role='trekker').count(),
        'staff': User.query.filter_by(role='staff').count(),
        'bookings': Booking.query.count(),
        'recent_bookings': [b.to_dict() for b in
                            Booking.query.order_by(Booking.id.desc()).limit(5).all()],
    })


@app.route('/api/admin/treks', methods=['GET', 'POST'])
@login_required
@role_required('admin')
def admin_treks():
    if request.method == 'POST':
        d = request.get_json()
        trek = Trek(
            name=d.get('name'), location=d.get('location'),
            difficulty=d.get('difficulty'), duration=int(d.get('duration') or 0),
            available_slots=int(d.get('available_slots') or 0),
            status=d.get('status', 'Pending'),
            start_date=d.get('start_date', ''), end_date=d.get('end_date', ''),
            description=d.get('description', ''),
            assigned_staff_id=d.get('assigned_staff_id') or None,
        )
        db.session.add(trek)
        db.session.commit()
        cache.delete('open_treks')          # invalidate cache — data changed
        return jsonify(trek.to_dict()), 201

    q = request.args.get('q', '').strip()
    treks = Trek.query
    if q:
        treks = treks.filter(Trek.id == int(q)) if q.isdigit() \
            else treks.filter(Trek.name.ilike(f'%{q}%'))
    return jsonify([t.to_dict() for t in treks.all()])


@app.route('/api/admin/treks/<int:trek_id>', methods=['PUT', 'DELETE'])
@login_required
@role_required('admin')
def admin_trek_detail(trek_id):
    trek = Trek.query.get_or_404(trek_id)
    if request.method == 'DELETE':
        Booking.query.filter_by(trek_id=trek.id).delete()   # avoid orphans
        db.session.delete(trek)
        db.session.commit()
        cache.delete('open_treks')
        return jsonify({'message': 'Trek deleted'})

    d = request.get_json()
    trek.name = d.get('name', trek.name)
    trek.location = d.get('location', trek.location)
    trek.difficulty = d.get('difficulty', trek.difficulty)
    trek.duration = int(d.get('duration') or trek.duration or 0)
    trek.available_slots = int(d.get('available_slots') or 0)
    trek.status = d.get('status', trek.status)
    trek.start_date = d.get('start_date', trek.start_date)
    trek.end_date = d.get('end_date', trek.end_date)
    trek.description = d.get('description', trek.description)
    trek.assigned_staff_id = d.get('assigned_staff_id') or None
    db.session.commit()
    cache.delete('open_treks')
    return jsonify(trek.to_dict())


@app.route('/api/admin/staff', methods=['GET', 'POST'])
@login_required
@role_required('admin')
def admin_staff():
    # V2 change: admin CREATES staff directly (wireframe #5) — issues them
    # credentials right away. No self-register + approve flow like MAD1.
    if request.method == 'POST':
        d = request.get_json()
        if User.query.filter_by(email=d.get('email')).first():
            return jsonify({'error': 'Email already registered'}), 400
        staff = User(name=d.get('name'), email=d.get('email'),
                    password=generate_password_hash(d.get('password')),
                    role='staff', is_active=True, contact=d.get('contact', ''))
        db.session.add(staff)
        db.session.commit()
        return jsonify(staff.to_dict()), 201

    q = request.args.get('q', '').strip()
    staff = User.query.filter_by(role='staff')
    if q:
        staff = staff.filter(User.id == int(q)) if q.isdigit() \
            else staff.filter(User.name.ilike(f'%{q}%'))
    return jsonify([s.to_dict() for s in staff.all()])


@app.route('/api/admin/staff/<int:user_id>/toggle', methods=['POST'])
@login_required
@role_required('admin')
def admin_toggle_staff(user_id):
    u = User.query.get_or_404(user_id)
    u.is_active = not u.is_active
    db.session.commit()
    return jsonify(u.to_dict())


@app.route('/api/admin/users')
@login_required
@role_required('admin')
def admin_users():
    q = request.args.get('q', '').strip()
    users = User.query.filter_by(role='trekker')
    if q:
        users = users.filter(User.id == int(q)) if q.isdigit() \
            else users.filter(User.name.ilike(f'%{q}%'))
    return jsonify([u.to_dict() for u in users.all()])


@app.route('/api/admin/users/<int:user_id>/toggle', methods=['POST'])
@login_required
@role_required('admin')
def admin_toggle_user(user_id):
    u = User.query.get_or_404(user_id)
    u.is_active = not u.is_active
    db.session.commit()
    return jsonify(u.to_dict())


@app.route('/api/admin/bookings')
@login_required
@role_required('admin')
def admin_bookings():
    return jsonify([b.to_dict() for b in Booking.query.order_by(Booking.id.desc()).all()])


@app.route('/api/admin/reports')
@login_required
@role_required('admin')
def admin_reports():
    # Basic analytics data for a Chart.js chart on the frontend.
    popular = db.session.query(Trek.name, db.func.count(Booking.id).label('c')) \
        .join(Booking).group_by(Trek.id).order_by(db.desc('c')).limit(5).all()
    return jsonify({
        'treks_by_status': {s: Trek.query.filter_by(status=s).count()
                            for s in ['Pending', 'Approved', 'Open', 'Closed', 'Completed']},
        'popular_treks': [{'name': n, 'bookings': c} for n, c in popular],
    })


# =============================================================================
# STAFF API
# =============================================================================

@app.route('/api/staff/dashboard')
@login_required
@role_required('staff')
def staff_dashboard():
    me = current_user()
    treks = Trek.query.filter_by(assigned_staff_id=me.id).all()
    counts = {t.id: sum(1 for b in t.bookings if b.status != 'Cancelled') for t in treks}
    return jsonify({
        'treks': [t.to_dict() for t in treks],
        'counts': counts,
        'total_participants': sum(counts.values()),
        'open_count': sum(1 for t in treks if t.status == 'Open'),
    })


@app.route('/api/staff/treks/<int:trek_id>', methods=['GET', 'PUT'])
@login_required
@role_required('staff')
def staff_trek_detail(trek_id):
    me = current_user()
    trek = Trek.query.get_or_404(trek_id)
    if trek.assigned_staff_id != me.id:
        return jsonify({'error': 'This trek is not assigned to you'}), 403

    if request.method == 'PUT':
        d = request.get_json()
        trek.available_slots = int(d.get('available_slots') or 0)
        trek.status = d.get('status', trek.status)
        db.session.commit()
        cache.delete('open_treks')
        return jsonify(trek.to_dict())

    participants = [b.to_dict() for b in trek.bookings if b.status != 'Cancelled']
    return jsonify({'trek': trek.to_dict(), 'participants': participants})


@app.route('/api/staff/treks/<int:trek_id>/mark/<status>', methods=['POST'])
@login_required
@role_required('staff')
def staff_mark_trek(trek_id, status):
    me = current_user()
    trek = Trek.query.get_or_404(trek_id)
    if trek.assigned_staff_id != me.id:
        return jsonify({'error': 'Not your trek'}), 403
    if status not in ('Open', 'Closed', 'Completed'):
        return jsonify({'error': 'Invalid status'}), 400

    trek.status = status
    if status == 'Completed':
        for b in trek.bookings:
            if b.status == 'Booked':
                b.status = 'Completed'
    db.session.commit()
    cache.delete('open_treks')
    return jsonify(trek.to_dict())


# =============================================================================
# USER (TREKKER) API
# =============================================================================

@app.route('/api/user/dashboard')
@login_required
@role_required('trekker')
def user_dashboard():
    me = current_user()
    bookings = Booking.query.filter_by(user_id=me.id).all()
    return jsonify({'bookings': [b.to_dict() for b in bookings]})


@app.route('/api/user/treks')
@login_required
@role_required('trekker')
def user_browse_treks():
    difficulty = request.args.get('difficulty', '')
    location = request.args.get('location', '')
    duration = request.args.get('duration', '')

    # Cache only the UNFILTERED "all open treks" result — the common case —
    # keyed by a fixed string, with a TTL from CACHE_DEFAULT_TIMEOUT above.
    cache_key = 'open_treks'
    if not difficulty and not location and not duration:
        cached = cache.get(cache_key)
        if cached is not None:
            return jsonify(cached)

    treks = Trek.query.filter_by(status='Open')
    if difficulty:
        treks = treks.filter_by(difficulty=difficulty)
    if location:
        treks = treks.filter(Trek.location.ilike(f'%{location}%'))
    if duration:
        treks = treks.filter(Trek.duration <= int(duration))
    result = [t.to_dict() for t in treks.all()]

    if not difficulty and not location and not duration:
        cache.set(cache_key, result)        # populate cache for next request
    return jsonify(result)


@app.route('/api/user/treks/<int:trek_id>')
@login_required
@role_required('trekker')
def user_trek_detail(trek_id):
    return jsonify(Trek.query.get_or_404(trek_id).to_dict())


@app.route('/api/user/treks/<int:trek_id>/book', methods=['POST'])
@login_required
@role_required('trekker')
def user_book(trek_id):
    me = current_user()
    trek = Trek.query.get_or_404(trek_id)

    if trek.status != 'Open':
        return jsonify({'error': 'This trek is not open for booking'}), 400
    existing = Booking.query.filter(Booking.user_id == me.id, Booking.trek_id == trek.id,
                                    Booking.status != 'Cancelled').first()
    if existing:
        return jsonify({'error': 'You already booked this trek'}), 400
    if trek.available_slots <= 0:
        return jsonify({'error': 'No slots left'}), 400

    booking = Booking(user_id=me.id, trek_id=trek.id,
                      booking_date=str(date.today()), status='Booked')
    trek.available_slots -= 1
    db.session.add(booking)
    db.session.commit()
    cache.delete('open_treks')
    return jsonify(booking.to_dict()), 201


@app.route('/api/user/bookings/<int:booking_id>/cancel', methods=['POST'])
@login_required
@role_required('trekker')
def user_cancel(booking_id):
    me = current_user()
    booking = Booking.query.get_or_404(booking_id)
    if booking.user_id != me.id:
        return jsonify({'error': 'Not your booking'}), 403
    if booking.status == 'Booked':
        booking.status = 'Cancelled'
        booking.trek.available_slots += 1
        db.session.commit()
        cache.delete('open_treks')
    return jsonify(booking.to_dict())


@app.route('/api/user/bookings')
@login_required
@role_required('trekker')
def user_bookings():
    me = current_user()
    return jsonify([b.to_dict() for b in Booking.query.filter_by(user_id=me.id).all()])


@app.route('/api/user/history')
@login_required
@role_required('trekker')
def user_history():
    me = current_user()
    history = Booking.query.filter(Booking.user_id == me.id,
                                   Booking.status.in_(['Completed', 'Cancelled'])).all()
    return jsonify([b.to_dict() for b in history])


@app.route('/api/user/profile', methods=['GET', 'PUT'])
@login_required
@role_required('trekker')
def user_profile():
    me = current_user()
    if request.method == 'PUT':
        d = request.get_json()
        me.name = d.get('name', me.name)
        me.contact = d.get('contact', me.contact)
        db.session.commit()
        session['name'] = me.name
    return jsonify(me.to_dict())


@app.route('/api/user/export', methods=['POST'])
@login_required
@role_required('trekker')
def user_export():
    # Kicks off the async Celery job (see tasks.py). Returns a task_id the
    # frontend polls to know when the CSV is ready.
    from tasks import export_booking_history_csv
    me = current_user()
    task = export_booking_history_csv.delay(me.id)
    return jsonify({'task_id': task.id})


@app.route('/api/user/export/status/<task_id>')
@login_required
@role_required('trekker')
def user_export_status(task_id):
    from celery_app import celery
    result = celery.AsyncResult(task_id)
    if result.state == 'SUCCESS':
        return jsonify({'state': result.state, 'filename': result.result})
    return jsonify({'state': result.state})


@app.route('/exports/<path:filename>')
@login_required
def download_export(filename):
    from flask import send_from_directory
    return send_from_directory('exports', filename, as_attachment=True)


if __name__ == '__main__':
    app.run(debug=True, port=5000)
