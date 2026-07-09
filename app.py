from flask import Flask, request, jsonify, render_template, send_file
import os
import logging
from scraper import get_bill_details

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, template_folder='templates', static_folder='static')
app.secret_key = "lesco_secret_key"

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/check_single', methods=['POST'])
def check_single():
    data = request.get_json() or {}
    ref_no = data.get('ref_no')
    if not ref_no:
        return jsonify({"status": "Error", "message": "Reference number is required."}), 400
        
    result = get_bill_details(ref_no)
    return jsonify(result)

@app.route('/view_bill/<ref_no>')
def view_bill_rendered(ref_no):
    clean_ref = ref_no.replace(" ", "").replace("-", "")
    import tempfile
    temp_dir = tempfile.gettempdir()
    file_path = os.path.join(temp_dir, f"{clean_ref}.html")
    
    # Try reading from system temp first (if cached)
    if os.path.exists(file_path):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                html_content = f.read()
            return html_content, 200, {"Content-Type": "text/html"}
        except Exception as e:
            logger.warning(f"Failed to read cached temp bill: {e}")
            
    # Fallback: Dynamically fetch html from PITC
    from scraper import fetch_bill_html
    html, err = fetch_bill_html(clean_ref)
    if not err:
        # Inject base tag for PITC assets
        head_idx = html.lower().find("<head>")
        if head_idx != -1:
            insert_pos = head_idx + 6
            html = html[:insert_pos] + '\n    <base href="https://bill.pitc.com.pk/">' + html[insert_pos:]
        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(html)
        except Exception as e:
            logger.warning(f"Failed to write bill to temp: {e}")
        return html, 200, {"Content-Type": "text/html"}
        
    return f"Bill details could not be retrieved: {err}", 404

if __name__ == '__main__':
    # Default to port 7860 for Hugging Face Spaces / Vercel compatibility
    port = int(os.environ.get("PORT", 7860))
    app.run(host='0.0.0.0', port=port, debug=False)
