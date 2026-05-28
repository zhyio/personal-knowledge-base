import os
import requests
import json
from datetime import datetime, timezone
import urllib.parse

OBSIDIAN_DIR = "/Users/papillon/Library/Mobile Documents/iCloud~md~obsidian/Documents"
SUPABASE_URL = "https://owqhouyafggdzgcqwlji.supabase.co"
SUPABASE_KEY = "sb_publishable_QgsSE7ZoIfcaPsJLlkfS5w_tGvRz_I6"

def sync_notes():
    if not os.path.exists(OBSIDIAN_DIR):
        print(f"Error: Obsidian directory not found at {OBSIDIAN_DIR}")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }

    print("Scanning Obsidian directory...")
    notes_data = []

    for root, dirs, files in os.walk(OBSIDIAN_DIR):
        # Exclude hidden directories like .obsidian
        dirs[:] = [d for d in dirs if not d.startswith('.')]
        
        for file in files:
            if file.endswith(".md"):
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, OBSIDIAN_DIR)
                
                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    
                    stat = os.stat(file_path)
                    last_modified = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat()
                    
                    folder = os.path.dirname(rel_path)
                    if folder == "":
                        folder = "Root"
                        
                    title = os.path.splitext(file)[0]
                    
                    notes_data.append({
                        "id": rel_path,
                        "title": title,
                        "content": content,
                        "folder": folder,
                        "last_modified": last_modified
                    })
                except Exception as e:
                    print(f"Failed to read {rel_path}: {e}")

    if not notes_data:
        print("No markdown files found.")
        return

    print(f"Found {len(notes_data)} notes. Uploading to Supabase...")
    
    # Supabase allows bulk inserts up to a limit. We can chunk it.
    chunk_size = 50
    for i in range(0, len(notes_data), chunk_size):
        chunk = notes_data[i:i+chunk_size]
        try:
            url = f"{SUPABASE_URL}/rest/v1/kb_notes?on_conflict=id"
            res = requests.post(url, headers=headers, json=chunk)
            if res.status_code in [200, 201]:
                print(f"Synced {i + len(chunk)}/{len(notes_data)} notes.")
            else:
                print(f"Failed to sync chunk starting at index {i}. Status: {res.status_code}")
                print(res.text)
        except Exception as e:
            print(f"Error making request to Supabase: {e}")

if __name__ == "__main__":
    sync_notes()
