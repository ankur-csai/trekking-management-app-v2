# seed.py — creates every table programmatically (db.create_all) and the
# one pre-existing admin, exactly as the spec requires (no admin signup,
# no manual DB Browser creation). Run once: python seed.py

from app import app, db, User
from werkzeug.security import generate_password_hash

with app.app_context():
    db.create_all()
    if not User.query.filter_by(role='admin').first():
        admin = User(name='Admin', email='admin@trek.com',
                    password=generate_password_hash('admin123'),
                    role='admin', is_active=True)
        db.session.add(admin)
        db.session.commit()
        print('Admin created -> email: admin@trek.com  password: admin123')
    else:
        print('Admin already exists.')
