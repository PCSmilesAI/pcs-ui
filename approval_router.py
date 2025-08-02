import json
import os

INVOICE_QUEUE = "invoice_queue.json"
FIRST_APPROVAL_QUEUE = "first_approval_queue.json"
SECOND_APPROVAL_QUEUE = "second_approval_queue.json"

CLINIC_APPROVER_MAP = {
    "SandySprings": "alice@pcs.com",
    "Vancouver": "jessica@pcs.com",
    "Riddle": "laura@pcs.com"
    # Add more mappings as needed
}


# Load or initialize JSON

def load_json(path):
    if os.path.exists(path):
        with open(path, "r") as f:
            return json.load(f)
    return []

def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# Process invoices in the queue
def route_invoices():
    queue = load_json(INVOICE_QUEUE)
    first_approval = load_json(FIRST_APPROVAL_QUEUE)
    second_approval = load_json(SECOND_APPROVAL_QUEUE)
    updated_queue = []

    for inv in queue:
        if inv.get("status") != "new":
            updated_queue.append(inv)
            continue

        # Attach clinic approver
        clinic_id = inv.get("clinic_id")
        inv["clinic_approver"] = CLINIC_APPROVER_MAP.get(clinic_id, "unknown@pcs.com")

        if inv.get("capital_ex") or any(item.get("total", 0) > 1000 for item in inv.get("line_items", [])):
            inv["status"] = "second_approval"
            second_approval.append(inv)
        else:
            inv["status"] = "first_approval"
            first_approval.append(inv)

    save_json(FIRST_APPROVAL_QUEUE, first_approval)
    save_json(SECOND_APPROVAL_QUEUE, second_approval)
    save_json(INVOICE_QUEUE, updated_queue)
    print("Routing complete.")


if __name__ == "__main__":
    route_invoices()

