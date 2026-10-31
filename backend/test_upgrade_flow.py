import sys
import json
from fastapi.testclient import TestClient
from main import app, STRIPE_WEBHOOK_SECRET

client = TestClient(app)

print("==================================================", flush=True)
print("TESTING UPGRADE TO PREMIUM FULL-STACK WORKFLOW", flush=True)
print("==================================================", flush=True)

# 1. Login as analyst
res_login = client.post("/auth/login", json={"email": "analyst@corp.test", "password": "Analyst#123"})
assert res_login.status_code == 200, f"Login failed: {res_login.text}"
data = res_login.json()
token = data["access_token"]
user_id = data["user_id"]
headers = {"Authorization": f"Bearer {token}"}
print(f"1. Analyst logged in (ID: {user_id}, Premium initially: {data['is_premium']})", flush=True)

# 2. Reset to Free plan
res_down = client.post("/payments/downgrade", headers=headers)
assert res_down.status_code == 200
headers = {"Authorization": f"Bearer {res_down.json()['access_token']}"}
print(f"2. Downgraded to Free plan for baseline test (is_premium: {res_down.json()['is_premium']})", flush=True)

# 3. Verify scan is blocked with 403 Forbidden on Free plan
assets = client.get("/assets", headers=headers).json()
asset_id = assets[0]["id"] if assets else 1
res_scan_blocked = client.post(f"/assets/{asset_id}/scan", headers=headers)
print(f"3. Scan on Free plan status: {res_scan_blocked.status_code} ({res_scan_blocked.json().get('detail')})", flush=True)
assert res_scan_blocked.status_code == 403, "Expected 403 Forbidden for Free user"

# 4. Perform Upgrade to Premium
res_upgrade = client.post("/payments/upgrade", headers=headers)
assert res_upgrade.status_code == 200, f"Upgrade failed: {res_upgrade.text}"
upgrade_data = res_upgrade.json()
premium_token = upgrade_data["access_token"]
headers_premium = {"Authorization": f"Bearer {premium_token}"}
print(f"4. Upgrade to Premium: Status {res_upgrade.status_code} - {upgrade_data.get('message')}", flush=True)
print(f"   Premium Status in DB: {upgrade_data['user']['is_premium']}", flush=True)
assert upgrade_data['user']['is_premium'] is True

# 5. Verify scan is now UNLOCKED and SUCCESSFUL
res_scan_unlocked = client.post(f"/assets/{asset_id}/scan", headers=headers_premium)
print(f"5. Scan on Premium plan status: {res_scan_unlocked.status_code}", flush=True)
assert res_scan_unlocked.status_code == 200, f"Expected 200 OK for Premium user, got {res_scan_unlocked.text}"
scan_result = res_scan_unlocked.json()
print(f"   Asset: {scan_result['asset_name']} ({scan_result['ip_address']})", flush=True)
print(f"   Open ports: {scan_result['open_ports']}, Total CVEs: {scan_result['total_cves']}", flush=True)

# 6. Verify Invoices
res_invoices = client.get("/payments/invoices", headers=headers_premium)
invoices = res_invoices.json()
print(f"6. Invoices retrieved: {len(invoices)} invoice(s) recorded in Supabase", flush=True)
latest_inv = invoices[0]
print(f"   Latest: {latest_inv['invoice_number']} - ${latest_inv['amount_cents']/100:.2f} ({latest_inv['status']})", flush=True)

# 7. Test Webhook Security Tamper Protection
secret = STRIPE_WEBHOOK_SECRET
payload = json.dumps({"type": "checkout.session.completed", "data": {"object": {"payment_status": "paid", "client_reference_id": str(user_id)}}})
res_tampered = client.post(
    "/payments/webhook",
    content=payload,
    headers={"stripe-signature": "t=12345678,v1=forged_bad_hash", "Content-Type": "application/json"}
)
print(f"7. Tampered webhook rejection: Status {res_tampered.status_code} ({res_tampered.json().get('detail')})", flush=True)
assert res_tampered.status_code == 400

print("\n==================================================", flush=True)
print("ALL UPGRADE TO PREMIUM WORKFLOW TESTS PASSED 100%!", flush=True)
print("==================================================", flush=True)
