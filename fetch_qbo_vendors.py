from quickbooks import QuickBooks
from quickbooks.objects.vendor import Vendor

# Replace these with your credentials
client_id = 'AB2KnsBep2GtaSf9yTLjxA90TZKlwcF5ItDjF89UiwQH75aaoE'
client_secret = 'SjQLypVE8KnRDsFWwmYJa8qFGH3jxqoMlk6bSF74'
refresh_token = 'YOUR_REFRESH_TOKEN'
realm_id = 'YOUR_REALM_ID'

# Initialize QuickBooks client
qbo = QuickBooks(
    sandbox=False,  # Set to True if using sandbox
    consumer_key=client_id,
    consumer_secret=client_secret,
    access_token='',
    access_token_secret='',
    company_id=realm_id,
    refresh_token=refresh_token
)

def fetch_vendors():
    vendors = Vendor.all(qbo=qbo)
    for vendor in vendors:
        print(f"Name: {vendor.DisplayName}, ID: {vendor.Id}")

if __name__ == "__main__":
    fetch_vendors()
