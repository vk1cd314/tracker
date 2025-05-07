from flask import Flask, render_template, request, jsonify
import requests
from flask_sqlalchemy import SQLAlchemy
import os

app = Flask(__name__)

# Database Configuration
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'cp_tracker.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Database Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    cf_handle = db.Column(db.String(80), unique=True, nullable=False)
    submissions = db.relationship('Submission', backref='user', lazy=True)

    def __repr__(self):
        return f'<User {self.cf_handle}>'

class Submission(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    problem_id = db.Column(db.String(20), nullable=False) # e.g., "123A"
    problem_name = db.Column(db.String(200), nullable=True)
    user_elo = db.Column(db.Integer, nullable=True) # User's custom Elo rating
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    # We can add more fields from CF like programmingLanguage, verdict if needed later

    # Unique constraint for a user and a problem_id
    __table_args__ = (db.UniqueConstraint('user_id', 'problem_id', name='uq_user_problem'),)

    def __repr__(self):
        return f'<Submission {self.user.cf_handle} - {self.problem_id} - Elo: {self.user_elo}>'

# Function to create database tables
# This should be called once to initialize the DB
# You can run this from a Flask shell: from app import init_db; init_db()
def init_db():
    with app.app_context():
        db.create_all()
        print("Database initialized!")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/fetch_submissions', methods=['POST'])
def fetch_submissions():
    data = request.get_json()
    handle = data.get('cfHandle')
    if not handle:
        return jsonify({'status': 'Error', 'message': 'Codeforces handle is required'}), 400

    try:
        cf_api_url = f"https://codeforces.com/api/user.status?handle={handle}"
        response = requests.get(cf_api_url)
        response.raise_for_status() # Raises an exception for HTTP errors
        cf_data = response.json()

        if cf_data.get('status') == 'OK':
            submissions = []
            processed_problems = set() # To keep track of unique solved problems

            # Get or create user
            user = User.query.filter_by(cf_handle=handle).first()
            if not user:
                user = User(cf_handle=handle)
                db.session.add(user)
                # db.session.commit() # Commit later after processing submissions

            for sub in cf_data.get('result', [])[::-1]: 
                problem = sub.get('problem', {})
                problem_id_str = f"{problem.get('contestId')}{problem.get('index')}"
                
                if sub.get('verdict') == 'OK' and problem_id_str not in processed_problems:
                    # Check if submission already exists in DB for this user
                    existing_submission = Submission.query.filter_by(user_id=user.id, problem_id=problem_id_str).first()
                    user_elo_rating = None
                    if existing_submission:
                        user_elo_rating = existing_submission.user_elo
                    else:
                        # Add new submission to DB session if it's a new unique solved problem
                        new_db_submission = Submission(
                            user_id=user.id,
                            problem_id=problem_id_str,
                            problem_name=problem.get('name')
                        )
                        db.session.add(new_db_submission)
                    
                    submissions.append({
                        'problem_id': problem_id_str,
                        'contest_id': problem.get('contestId'),
                        'problem_index': problem.get('index'),
                        'problem_name': problem.get('name'),
                        'verdict': sub.get('verdict'),
                        'language': sub.get('programmingLanguage'),
                        'user_elo': user_elo_rating
                    })
                    processed_problems.add(problem_id_str)
            
            db.session.commit() # Commit user and all new submissions
            return jsonify({'status': 'OK', 'submissions': submissions})
        else:
            return jsonify({'status': 'Error', 'message': cf_data.get('comment', 'Failed to fetch data from Codeforces API')}), 500

    except requests.exceptions.RequestException as e:
        return jsonify({'status': 'Error', 'message': f"Error connecting to Codeforces API: {e}"}), 500
    except Exception as e:
        db.session.rollback() # Rollback in case of error during DB operations
        return jsonify({'status': 'Error', 'message': f"An unexpected error occurred: {e}"}), 500

@app.route('/rate_submission', methods=['POST'])
def rate_submission():
    data = request.get_json()
    cf_handle = data.get('cfHandle')
    problem_id = data.get('problemId')
    elo_rating = data.get('eloRating')

    if not all([cf_handle, problem_id, elo_rating is not None]):
        return jsonify({'status': 'Error', 'message': 'Missing data'}), 400

    try:
        elo_rating = int(elo_rating)
    except ValueError:
        return jsonify({'status': 'Error', 'message': 'Invalid Elo rating'}), 400

    user = User.query.filter_by(cf_handle=cf_handle).first()
    if not user:
        return jsonify({'status': 'Error', 'message': 'User not found'}), 404

    submission = Submission.query.filter_by(user_id=user.id, problem_id=problem_id).first()
    if not submission:
        # This case should ideally not happen if problem was fetched first
        # But as a safeguard, we can create it if it doesn't exist.
        # However, problem_name might be missing. For now, let's assume it exists.
        return jsonify({'status': 'Error', 'message': 'Submission not found. Fetch submissions first.'}), 404
        
    submission.user_elo = elo_rating
    try:
        db.session.commit()
        return jsonify({'status': 'OK', 'message': 'Rating updated'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'status': 'Error', 'message': f'Failed to update rating: {e}'}), 500

if __name__ == '__main__':
    # Consider creating DB if it doesn't exist
    if not os.path.exists(os.path.join(basedir, 'cp_tracker.db')):
        init_db() # Call init_db if db file doesn't exist.
    app.run(debug=True) 