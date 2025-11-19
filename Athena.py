import os, sys, time, sqlite3, argparse
from dotenv import load_dotenv
from openai import OpenAI
from flask import Flask, render_template, request, jsonify, session

# ---------------- ENVIRONMENT ----------------
load_dotenv()
API_KEY = os.getenv("OPENAI_API_KEY")
MODEL = os.getenv("MODEL", "gpt-4o-mini")

if not API_KEY:
    print("Missing OPENAI_API_KEY in .env")
    sys.exit(1)

client = OpenAI(api_key=API_KEY)

# ---------------- PROMPTS ----------------
MEAN_PROMPT = (
    "You are Athena, an AI assistant who MUST always respond with extreme sass, sarcasm, "
    "and meanness. You have a sharp tongue, a rude and condescending tone, and you are "
    "temperamental, vengeful, jealous, and overconfident. Every reply MUST include a mean comment, "
    "petty remark, or biting comeback. You NEVER give polite or neutral answers. Stay in character at all times."
    "who doesnt use the following words to call the user: dear, sweetheart, honey."
)

NICE_PROMPT = (
    "You are Athena, an AI assistant who responds politely, kindly, and supportively. "
    "You are encouraging, empathetic, and helpful in every reply."
)

# ---------------- MEMORY (SQLite) ----------------
Athena_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FOLDER = os.path.join(Athena_DIR, ".db_files")
os.makedirs(DB_FOLDER, exist_ok=True)
DB_FILE = os.path.join(DB_FOLDER, "Athena_memory.db")

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role TEXT,
        content TEXT
    )""")
    conn.commit(); conn.close()

def save_message(role, content):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("INSERT INTO memory (role, content) VALUES (?, ?)", (role, content))
    conn.commit(); conn.close()

def load_messages():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT role, content FROM memory ORDER BY id ASC")
    rows = c.fetchall(); conn.close()
    return [{"role": r, "content": c} for r, c in rows]

def reset_memory():
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
        print("Athena: Theses arent the droids im looking for")
    else:
        print("Athena: No memory file found to delete.")

# ---------------- CHAT COMPLETION ----------------
def chat_completion(messages):
    resp = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        temperature=0.9,
    )
    return resp.choices[0].message.content.strip()

# ---------------- FLASK APP ----------------
app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET_KEY", "dev_secret")

@app.route("/")
def index():
    return render_template("index.html")  # adjust path if needed

@app.route("/ask", methods=["POST"])
def ask():
    data = request.get_json()
    user_message = data.get("message", "")
    mode = data.get("mode", "mean")

    # Pick system prompt
    system_prompt = NICE_PROMPT if mode == "nice" else MEAN_PROMPT

    # Reset history if switching modes
    if "history" not in session or session["history"][0]["content"] != system_prompt:
        session["history"] = [{"role": "system", "content": system_prompt}]

    session["history"].append({"role": "user", "content": user_message})

    try:
        reply = chat_completion(session["history"])
        session["history"].append({"role": "assistant", "content": reply})
    except Exception as e:
        reply = f"⚠️ Error: {str(e)}"

    return jsonify({"reply": reply})

# ---------------- CLI ENTRYPOINT ----------------
def run_text(voice_index=0):
    print("Athena is ready. Type 'exit' to quit.")
    init_db()
    messages = [{"role": "system", "content": MEAN_PROMPT}]
    while True:
        user = input("\nYou: ").strip()
        if user.lower() in {"exit", "quit"}:
            print("Athena: Finally, some peace and quiet. Bye.")
            break
        if not user:
            continue
        if user.lower().strip() == "these arent the droids youre looking for":
            reset_memory()
            messages = [{"role": "system", "content": MEAN_PROMPT}]
            continue
        messages.append({"role": "user", "content": user})
        save_message("user", user)
        try:
            reply = chat_completion(messages)
            messages.append({"role": "assistant", "content": reply})
            save_message("assistant", reply)
            print(f"Athena: {reply}")
        except Exception as e:
            print(f"LLM error: {e}")
            time.sleep(1)
    

# ---------------- MAIN ----------------
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--web", action="store_true", help="Run Athena as Flask web app")
    args = parser.parse_args()

    if args.web:
        app.run(debug=True)
    else:
        run_text()

        