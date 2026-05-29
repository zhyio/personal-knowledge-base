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

    print(f"Found {len(notes_data)} local notes.")
    
    # Try fetching remote notes first for two-way sync
    try:
        url = f"{SUPABASE_URL}/rest/v1/kb_notes?select=id,content,last_modified"
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            remote_notes = res.json()
            remote_map = {n['id']: n for n in remote_notes}
            
            # Check for newer remote notes to pull
            for note in notes_data:
                rid = note['id']
                if rid in remote_map:
                    remote = remote_map[rid]
                    # Compare timestamps
                    try:
                        local_time = datetime.fromisoformat(note['last_modified'].replace('Z', '+00:00'))
                        remote_time = datetime.fromisoformat(remote['last_modified'].replace('Z', '+00:00'))
                        
                        if remote_time > local_time:
                            print(f"Remote is newer for {rid}, pulling changes...")
                            # Overwrite local file
                            file_path = os.path.join(OBSIDIAN_DIR, rid)
                            with open(file_path, 'w', encoding='utf-8') as f:
                                f.write(remote['content'])
                            # Update local memory so we don't push the old one back immediately
                            note['content'] = remote['content']
                            note['last_modified'] = remote['last_modified']
                    except Exception as date_e:
                        print(f"Error parsing date for {rid}: {date_e}")
                        
    except Exception as e:
        print(f"Could not fetch remote notes for two-way sync: {e}")
        
    # Write fallback data.json
    try:
        with open("data.json", "w", encoding="utf-8") as f:
            json.dump(notes_data, f, ensure_ascii=False, indent=2)
        print("Saved fallback data.json")
    except Exception as e:
        print(f"Failed to save data.json: {e}")

    print(f"Uploading to Supabase...")
    
    # Supabase allows bulk inserts up to a limit. We can chunk it.
    chunk_size = 50
    for i in range(0, len(notes_data), chunk_size):
        chunk = notes_data[i:i+chunk_size]
        try:
            url = f"{SUPABASE_URL}/rest/v1/kb_notes?on_conflict=id"
            res = requests.post(url, headers=headers, json=chunk)
            if res.status_code in [200, 201]:
                print(f"Synced {i + len(chunk)}/{len(notes_data)} notes to Supabase.")
            else:
                print(f"Failed to sync chunk to Supabase. Status: {res.status_code}")
        except Exception as e:
            print(f"Error making request to Supabase: {e}")

if __name__ == "__main__":
    sync_notes()
