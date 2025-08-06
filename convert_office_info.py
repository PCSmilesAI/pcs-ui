#!/usr/bin/env python3
"""
Convert Office Info Script
Reads smiles_office_info.xls and converts it to JSON for frontend use.
"""
import pandas as pd
import json
import os

def convert_office_info():
    """Convert smiles_office_info.xls to JSON format"""
    xls_file = "smiles_office_info.xls"
    json_file = "public/office_info.json"
    
    if not os.path.exists(xls_file):
        print(f"❌ {xls_file} not found")
        return False
    
    try:
        # Read the Excel file
        print(f"📖 Reading {xls_file}...")
        df = pd.read_excel(xls_file)
        
        print(f"📊 Excel file columns: {list(df.columns)}")
        print(f"📊 Excel file shape: {df.shape}")
        
        # Display first few rows to understand structure
        print("\n📋 First few rows:")
        print(df.head())
        
        # The structure is: office names as columns, data types as rows
        # We need to transpose this to get offices as rows
        offices = []
        
        # Get the office names (columns except 'Name')
        office_columns = [col for col in df.columns if col != 'Name']
        
        for office_name in office_columns:
            # Get the data for this office
            office_data = {}
            
            # Find the row indices for each data type
            for index, row in df.iterrows():
                data_type = row['Name'].strip() if pd.notna(row['Name']) else ''
                value = row[office_name] if pd.notna(row[office_name]) else ''
                
                if data_type == 'Address':
                    office_data['address'] = str(value).strip()
                elif data_type == 'City':
                    office_data['city'] = str(value).strip()
                elif data_type == 'State':
                    office_data['state'] = str(value).strip()
                elif data_type == 'Office Manager':
                    office_data['manager'] = str(value).strip()
                elif data_type == 'Office Email':
                    office_data['email'] = str(value).strip()
            
            # Build the full address
            address_parts = []
            if 'address' in office_data and office_data['address']:
                address_parts.append(office_data['address'])
            if 'city' in office_data and office_data['city']:
                address_parts.append(office_data['city'])
            if 'state' in office_data and office_data['state']:
                address_parts.append(office_data['state'])
            
            full_address = ', '.join(address_parts) if address_parts else 'Address not provided'
            
            office_info = {
                'name': office_name.strip(),
                'address': full_address,
                'manager': office_data.get('manager', 'Manager not specified'),
                'email': office_data.get('email', '')
            }
            
            offices.append(office_info)
            print(f"✅ Processed: {office_info['name']} - {office_info['manager']} ({office_info['email']})")
            print(f"   Address: {office_info['address']}")
        
        # Save to JSON
        with open(json_file, 'w') as f:
            json.dump(offices, f, indent=2)
        
        print(f"\n✅ Successfully converted {len(offices)} offices to {json_file}")
        return True
        
    except Exception as e:
        print(f"❌ Error converting office info: {e}")
        return False

def main():
    print("🏢 PCS AI - Convert Office Info")
    print("=" * 50)
    convert_office_info()

if __name__ == "__main__":
    main() 