import requests
import re
import logging
import os
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Origin": "https://bill.pitc.com.pk",
    "Referer": "https://bill.pitc.com.pk/lescobill"
}

def extract_field(html, id_or_name):
    """
    Extracts the value of a hidden form field by its ID or name from ASP.NET HTML.
    """
    patterns = [
        rf'id="{id_or_name}"\s+value="([^"]*)"',
        rf'name="{id_or_name}"\s+value="([^"]*)"',
        rf'value="([^"]*)"\s+id="{id_or_name}"',
        rf'value="([^"]*)"\s+name="{id_or_name}"',
        rf'name="{id_or_name}"\s+type="hidden"\s+value="([^"]*)"',
        rf'type="hidden"\s+name="{id_or_name}"\s+value="([^"]*)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1)
    return ""

PROXIES_CACHE = []
LAST_FETCH_TIME = 0
HARDCODED_PK_PROXIES = [
    "103.115.196.98:8080",
    "182.185.165.125:8080",
    "103.115.196.98:80"
]

def fetch_pakistani_proxies():
    """
    Fetches a list of public Pakistani (PK) HTTP proxies from Proxyscrape and Geonode APIs
    to bypass geo-blocking/firewall restrictions on cloud data centers.
    """
    proxies = []
    
    # 1. Fetch from Proxyscrape PK HTTP
    try:
        url = "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=PK&ssl=all&anonymity=all"
        res = requests.get(url, timeout=6)
        if res.status_code == 200:
            for line in res.text.split("\n"):
                p = line.strip()
                if p and p not in proxies:
                    proxies.append(p)
    except Exception as e:
        logger.warning(f"Error fetching PK proxies from Proxyscrape: {e}")
        
    # 2. Fetch from Geonode PK HTTP
    try:
        url = "https://proxylist.geonode.com/api/proxy-list?limit=20&page=1&sort_by=lastChecked&sort_type=desc&country=PK"
        res = requests.get(url, timeout=6)
        if res.status_code == 200:
            data = res.json()
            for p in data.get('data', []):
                proxy_str = f"{p['ip']}:{p['port']}"
                if proxy_str not in proxies:
                    proxies.append(proxy_str)
    except Exception as e:
        logger.warning(f"Error fetching PK proxies from Geonode: {e}")
        
    # Combine with hardcoded fallback proxies
    for hp in HARDCODED_PK_PROXIES:
        if hp not in proxies:
            # Put hardcoded ones at the front of the rotation for faster initial resolution
            proxies.insert(0, hp)
            
    logger.info(f"Loaded {len(proxies)} unique Pakistani proxies for routing.")
    return proxies

def get_cached_proxies():
    """
    Retrieves the list of Pakistani proxies from memory cache, refreshing every 15 minutes.
    """
    global PROXIES_CACHE, LAST_FETCH_TIME
    current_time = time.time()
    
    if not PROXIES_CACHE or (current_time - LAST_FETCH_TIME > 900):
        try:
            logger.info("Refreshing Pakistani proxy cache...")
            PROXIES_CACHE = fetch_pakistani_proxies()
            LAST_FETCH_TIME = current_time
        except Exception as e:
            logger.warning(f"Failed to refresh proxy cache: {e}")
            if not PROXIES_CACHE:
                PROXIES_CACHE = list(HARDCODED_PK_PROXIES)
                
    return PROXIES_CACHE

def fetch_bill_html(ref_no_clean):
    """
    Simulates the ASP.NET Web Forms POST flow using requests.Session for automatic cookie handling.
    Supports both 14-digit Reference Numbers and 7-11 digit Customer IDs.
    Routes requests through Pakistani proxies on cloud servers (e.g. Hugging Face) to bypass geo-blocks.
    """
    # Determine if it is a Customer ID (typically 7 to 11 digits)
    is_customer_id = len(ref_no_clean) < 13
    
    if is_customer_id:
        # If it is 7 digits, pad it with a leading zero to make it 8 digits to bypass validation
        cust_id = ref_no_clean
        if len(cust_id) == 7:
            cust_id = "0" + cust_id
        search_val = cust_id
        mode = "appno"
        logger.info(f"Targeting Customer ID search flow for: {search_val}")
    else:
        search_val = ref_no_clean[:14]
        mode = "refno"
        logger.info(f"Targeting Reference Number search flow for: {search_val}")
        
    url = "https://bill.pitc.com.pk/lescobill"
    max_attempts = 8
    pk_proxies = []
    
    # Auto-detect if we are running in Hugging Face Spaces environment
    is_huggingface = os.environ.get("SPACE_ID") is not None
    
    for attempt in range(1, max_attempts + 1):
        session = requests.Session()
        use_proxy = False
        
        # On Hugging Face, start using proxies on attempt 1.
        # Locally, try direct connection on attempt 1, and fall back to proxies on attempts 2+.
        if is_huggingface or attempt > 1:
            if not pk_proxies:
                pk_proxies = get_cached_proxies()
                
            if pk_proxies:
                # Select proxy in rotation
                proxy = pk_proxies[(attempt - 1) % len(pk_proxies)]
                logger.info(f"Attempt {attempt}/{max_attempts}: Routing request via Pakistani proxy: {proxy}")
                session.proxies.update({
                    "http": f"http://{proxy}",
                    "https": f"http://{proxy}"
                })
                use_proxy = True
            else:
                logger.warning(f"Attempt {attempt}/{max_attempts}: No Pakistani proxies found. Trying direct connection...")
        
        if not use_proxy:
            logger.info(f"Attempt {attempt}/{max_attempts}: Initiating direct GET request to {url}...")
            
        try:
            # 1. GET Request (Shorter timeout when using proxy to skip dead ones quickly)
            res = session.get(url, headers=HEADERS, timeout=6 if use_proxy else 20)
            if res.status_code != 200:
                logger.warning(f"GET Request returned status code {res.status_code}")
                if res.status_code in [500, 502, 503, 504]:
                    time.sleep(1)
                    continue
                return None, f"Failed to retrieve GET state from portal: HTTP {res.status_code}"
                
            html = res.text
            
            # Extract verification tokens
            viewstate = extract_field(html, "__VIEWSTATE")
            viewstate_gen = extract_field(html, "__VIEWSTATEGENERATOR")
            event_validation = extract_field(html, "__EVENTVALIDATION")
            token = extract_field(html, "__RequestVerificationToken")
            
            if is_customer_id:
                # For Customer ID search, ASP.NET Web Forms requires a postback to switch the control mode
                logger.info(f"Attempt {attempt}/{max_attempts}: Sending Postback to switch search mode to Customer ID...")
                postback_data = {
                    "__EVENTTARGET": "rbSearchByList$1",
                    "__EVENTARGUMENT": "",
                    "__LASTFOCUS": "",
                    "__VIEWSTATE": viewstate,
                    "__VIEWSTATEGENERATOR": viewstate_gen,
                    "__EVENTVALIDATION": event_validation,
                    "__RequestVerificationToken": token,
                    "rbSearchByList": "appno",
                    "searchTextBox": "",
                    "ruCodeTextBox": ""
                }
                
                pb_res = session.post(url, data=postback_data, headers=HEADERS, timeout=8 if use_proxy else 25)
                if pb_res.status_code != 200:
                    logger.warning(f"Postback returned status code {pb_res.status_code}")
                    if pb_res.status_code in [500, 502, 503, 504]:
                        time.sleep(1)
                        continue
                    return None, f"Failed to execute postback: HTTP {pb_res.status_code}"
                    
                pb_html = pb_res.text
                
                # Extract new viewstate after postback
                viewstate = extract_field(pb_html, "__VIEWSTATE")
                viewstate_gen = extract_field(pb_html, "__VIEWSTATEGENERATOR")
                event_validation = extract_field(pb_html, "__EVENTVALIDATION")
                token = extract_field(pb_html, "__RequestVerificationToken")
            
            # Prepare final form POST data
            post_data = {
                "__EVENTTARGET": "",
                "__EVENTARGUMENT": "",
                "__LASTFOCUS": "",
                "__VIEWSTATE": viewstate,
                "__VIEWSTATEGENERATOR": viewstate_gen,
                "__EVENTVALIDATION": event_validation,
                "__RequestVerificationToken": token,
                "rbSearchByList": mode,
                "searchTextBox": search_val,
                "ruCodeTextBox": "",
                "btnSearch": "Search"
            }
            
            # Suffix is only relevant for reference numbers
            if not is_customer_id and len(ref_no_clean) > 14:
                suffix = ref_no_clean[14].upper()
                if suffix == 'R':
                    post_data["ruCodeTextBox"] = "R"
                elif suffix == 'U':
                    post_data["ruCodeTextBox"] = ""
                    
            logger.info(f"Attempt {attempt}/{max_attempts}: Sending final POST request to fetch bill data...")
            post_res = session.post(url, data=post_data, headers=HEADERS, timeout=10 if use_proxy else 45)
            
            if post_res.status_code != 200:
                logger.warning(f"POST Request returned status code {post_res.status_code}")
                if post_res.status_code in [500, 502, 503, 504]:
                    time.sleep(1)
                    continue
                return None, f"Failed to retrieve bill details: HTTP {post_res.status_code}"
                
            return post_res.text, None
                
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as ce:
            logger.warning(f"Attempt {attempt} failed with network error: {ce}")
            if attempt == max_attempts:
                return None, "Connection timed out. LESCO billing server or proxy is slow/unreachable. Please try again."
        except requests.exceptions.RequestException as e:
            logger.warning(f"Attempt {attempt} encountered RequestException: {e}")
            if attempt == max_attempts:
                return None, f"Failed to retrieve bill: {str(e)}"

def parse_bill_html(html, original_input):
    """
    Parses the response HTML to extract LESCO billing details.
    """
    # Check for "Bill Not Found"
    if "bill-not-found" in html or "Bill Not Found!" in html:
        return {
            "input_reference": original_input,
            "status": "Not Found",
            "message": "Bill record not found for this reference number/ID on LESCO portal."
        }
        
    if "bill-canvas-viewport" not in html and "gbn-app-shell" not in html:
        is_customer_id = len(original_input.replace(" ", "").replace("-", "")) < 13
        if is_customer_id:
            msg = "Bill not found. Note: LESCO portal usually only supports searching by 14-digit Reference Number, and Consumer ID index is not searchable."
        else:
            msg = "Bill record not found on LESCO portal. Please verify the Reference Number."
        return {
            "input_reference": original_input,
            "status": "Not Found",
            "message": msg
        }
        
    data = {"input_reference": original_input, "message": "Success"}
    
    # 1. Reference Number
    ref_match = re.search(r'REFERENCE NO.*?حوالہ نمبر.*?<\/div>\s*<div class="val-space[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
    if ref_match:
        data["reference_no"] = ref_match.group(1).strip()
    else:
        ref_match = re.search(r'REFERENCE NO.*?<\/div>\s*<div class="val-space[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
        data["reference_no"] = ref_match.group(1).strip() if ref_match else ""
        
    # 2. Consumer ID
    id_match = re.search(r'CONSUMER ID.*?کنزیومر نمبر.*?<\/div>\s*<div class="val-space[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
    if id_match:
        data["consumer_id"] = id_match.group(1).strip()
    else:
        id_match = re.search(r'CONSUMER ID.*?<\/div>\s*<div class="val-space[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
        data["consumer_id"] = id_match.group(1).strip() if id_match else ""
        
    # 3. Consumer Name & Address
    name_match = re.search(r'NAME\s*&\s*ADDRESS.*?نام و پتہ.*?<\/div>\s*<div class="val-space[^"]*">\s*<span>([^<]+)<\/span>', html, re.DOTALL | re.IGNORECASE)
    if name_match:
        full_name_addr = name_match.group(1).strip()
        data["full_name_address"] = full_name_addr
        # Extract name before S/O or first comma
        name_part = re.split(r'\s+S/O\s+|\s+S/o\s+|,', full_name_addr)[0].strip()
        data["consumer_name"] = name_part
    else:
        name_match = re.search(r'NAME\s*&\s*ADDRESS.*?<\/div>\s*<div class="val-space[^"]*">\s*<span>([^<]+)<\/span>', html, re.DOTALL | re.IGNORECASE)
        if name_match:
            full_name_addr = name_match.group(1).strip()
            data["full_name_address"] = full_name_addr
            name_part = re.split(r'\s+S/O\s+|\s+S/o\s+|,', full_name_addr)[0].strip()
            data["consumer_name"] = name_part
        else:
            data["full_name_address"] = ""
            data["consumer_name"] = ""
        
    # 4. Bill Month
    month_match = re.search(r'BILL MONTH.*?مہینہ بل.*?<\/div>\s*<div class="right-main-val[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
    if month_match:
        data["bill_month"] = month_match.group(1).strip()
    else:
        month_match = re.search(r'BILL MONTH.*?<\/div>\s*<div class="right-main-val[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
        data["bill_month"] = month_match.group(1).strip() if month_match else ""
        
    # 5. Due Date
    due_match = re.search(r'DUE DATE.*?مقررہ تاریخ.*?<\/div>\s*<div class="right-main-val[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
    if due_match:
        data["due_date"] = due_match.group(1).strip()
    else:
        due_match = re.search(r'DUE DATE.*?<\/div>\s*<div class="right-main-val[^"]*">([^<]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
        data["due_date"] = due_match.group(1).strip() if due_match else ""
        
    # 6. Payable Within Due Date
    payable_match = re.search(r'PAYABLE WITHIN.*?DUE DATE.*?<\/div>\s*<div style="[^"]*font-size:\s*17px[^"]*">\s*([0-9,]+)\s*<\/div>', html, re.DOTALL | re.IGNORECASE)
    if payable_match:
        data["payable_within_due_date"] = int(payable_match.group(1).replace(',', '').strip())
    else:
        grand_match = re.search(r'Grand Total.*?کل واجبات.*?<\/div>\s*<span class="charges-bd-val">([0-9,]+)<\/span>', html, re.DOTALL | re.IGNORECASE)
        data["payable_within_due_date"] = int(grand_match.group(1).replace(',', '').strip()) if grand_match else 0
        
    # 7. Payable After Due Date
    after_due_match = re.findall(r'After 02--UL.*?<\/div>\s*<div[^>]*>([0-9,]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
    if after_due_match:
        data["payable_after_due_date"] = int(after_due_match[-1].replace(',', '').strip())
    else:
        slip_late_matches = re.findall(r'After 02--UL.*?([0-9,]+)', html, re.DOTALL | re.IGNORECASE)
        if slip_late_matches:
            data["payable_after_due_date"] = int(slip_late_matches[-1].replace(',', '').strip())
        else:
            # Look specifically for surcharge container val
            surcharge_match = re.search(r'After 02--UL.*?class="lp-surcharge-bottom-val"[^>]*>([0-9,]+)<\/div>', html, re.DOTALL | re.IGNORECASE)
            if surcharge_match:
                data["payable_after_due_date"] = int(surcharge_match.group(1).replace(',', '').strip())
            else:
                data["payable_after_due_date"] = 0
            
    # 8. Paid Status, Amount Paid, and Payment Date
    status_match = re.search(r'<div class="paid-status-note">Amount Paid:\s*([0-9,]+)\s*—\s*([^<]+)<\/div>', html, re.IGNORECASE)
    if status_match:
        data["payment_status"] = "Paid"
        data["amount_paid"] = int(status_match.group(1).replace(',', ''))
        data["payment_date"] = status_match.group(2).strip()
    elif "full_bill_paid.png" in html:
        data["payment_status"] = "Paid"
        data["amount_paid"] = data["payable_within_due_date"]
        data["payment_date"] = "Processed (Unknown Date)"
    else:
        data["payment_status"] = "Unpaid"
        data["amount_paid"] = 0
        data["payment_date"] = "N/A"
        
    return data

def get_bill_details(raw_input):
    """
    Cleans the raw input reference number and fetches/parses the LESCO bill details.
    Saves the fetched HTML as a temporary static page if query succeeds.
    """
    if not raw_input:
        return {"input_reference": "", "status": "Error", "message": "Reference number cannot be empty."}
        
    raw_str = str(raw_input).strip()
    # Remove all spaces and dashes
    clean_str = raw_str.replace(" ", "").replace("-", "")
    
    # Check length requirements
    if len(clean_str) < 7:
        return {"input_reference": raw_str, "status": "Error", "message": "Invalid input length. Must be a valid Reference No (14 digits) or Customer ID (7+ digits)."}
        
    html, err = fetch_bill_html(clean_str)
    if err:
        return {"input_reference": raw_str, "status": "Error", "message": err}
        
    try:
        res = parse_bill_html(html, raw_str)
        if res.get("message") == "Success":
            import os
            # Insert <base href="https://bill.pitc.com.pk/"> inside the <head> tag
            modified_html = html
            head_idx = html.lower().find("<head>")
            if head_idx != -1:
                insert_pos = head_idx + 6
                modified_html = html[:insert_pos] + '\n    <base href="https://bill.pitc.com.pk/">' + html[insert_pos:]
            
            import tempfile
            # Use cross-platform system temporary directory (fully writeable on serverless)
            temp_dir = tempfile.gettempdir()
            
            bill_file_name = f"{clean_str}.html"
            bill_file_path = os.path.join(temp_dir, bill_file_name)
            with open(bill_file_path, "w", encoding="utf-8") as f:
                f.write(modified_html)
                
            res["bill_link"] = f"/view_bill/{clean_str}"
            
        return res
    except Exception as e:
        logger.error(f"Error parsing bill HTML for {raw_str}: {e}")
        return {"input_reference": raw_str, "status": "Error", "message": f"Parsing failed: {str(e)}"}
