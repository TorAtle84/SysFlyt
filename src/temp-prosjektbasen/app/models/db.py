from flask_sqlalchemy import SQLAlchemy

print("DEBUG: app/models/db.py blir utført.") # Diagnostisk print
db = SQLAlchemy()
print(f"DEBUG: 'db' objekt opprettet i app/models/db.py: {db}") # Diagnostisk print