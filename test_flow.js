const { JSDOM } = require("jsdom");
const http = require("http");
const fs = require("fs");
const path = require("path");

const server = http.createServer((req, res) => {
  let filePath = '.' + req.url;
  if (filePath == './') filePath = './index.html';
  const extname = path.extname(filePath);
  let contentType = 'text/html';
  if (extname === '.js') contentType = 'text/javascript';
  if (extname === '.css') contentType = 'text/css';
  if (extname === '.json') contentType = 'application/json';
  
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if(err.code == 'ENOENT'){
        res.writeHead(404);
        res.end();
      } else {
        res.writeHead(500);
        res.end();
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
}).listen(0, async () => {
  const PORT = server.address().port;
  console.log(`Server running on port ${PORT}...`);
  try {
    const dom = await JSDOM.fromURL(`http://localhost:${PORT}/`, {
      runScripts: "dangerously",
      resources: "usable",
      beforeParse(window) {
        window.matchMedia = () => ({ matches: false });
        window.fetch = async (url) => {
          if (url === 'data.json') {
            const data = fs.readFileSync(path.join(__dirname, 'data.json'), 'utf-8');
            return {
              ok: true,
              json: async () => JSON.parse(data)
            };
          }
          return { ok: false };
        };
        window.prompt = () => "Auto Created Note";
      }
    });
    
    // Give it a moment to load and fetch data.json
    setTimeout(() => {
      console.log("Starting tests...");
      const window = dom.window;
      const document = window.document;
      
      let allPass = true;
      function check(condition, message) {
        if (condition) {
          console.log(`✅ PASS: ${message}`);
        } else {
          console.error(`❌ FAIL: ${message}`);
          allPass = false;
        }
      }

      // TEST 1: Notes are loaded
      const recentGrid = document.getElementById("recentGrid");
      check(recentGrid.innerHTML.includes("note-card"), "Notes loaded into recentGrid");

      // TEST 2: Open Note
      const firstNote = recentGrid.querySelector(".note-card");
      if (firstNote) {
        firstNote.click();
        const modal = document.getElementById("noteModal");
        check(modal.classList.contains("open"), "Note modal opened successfully");
      } else {
        check(false, "Could not find note to click");
      }

      // TEST 3: Edit and Save
      const editBtn = document.getElementById("btnEditNote");
      const editor = document.getElementById("modalNoteEditor");
      const saveBtn = document.getElementById("btnSaveNote");
      
      editBtn.click();
      check(!editor.classList.contains("hidden"), "Entered edit mode");
      
      editor.value = "New offline content edit test";
      saveBtn.click();
      
      // Wait for save
      setTimeout(() => {
        const content = document.getElementById("modalNoteContent");
        check(content.innerHTML.includes("New offline content edit test"), "Edit saved and rendered in modalNoteContent");
        
        // Check localStorage
        const local = window.localStorage.getItem('kb_offline_notes');
        check(local && local.includes("New offline content edit test"), "Edit persisted to localStorage");
        
        // TEST 4: Pinning
        const pinBtn = document.getElementById("btnPinNote");
        pinBtn.click(); // toggle pin on
        
        setTimeout(() => {
          const localPinned = window.localStorage.getItem('kb_offline_notes');
          check(localPinned && localPinned.includes("pinned: true"), "Pin state added to frontmatter in localStorage");
          
          // TEST 5: Create New Note
          const btnNewNote = document.getElementById("btnNewNote");
          btnNewNote.click(); // Uses mocked prompt
          
          setTimeout(() => {
            const editor = document.getElementById("modalNoteEditor");
            check(!editor.classList.contains("hidden") && editor.value.includes("Auto Created Note"), "New note created and opened in edit mode");
            
            const saveBtn = document.getElementById("btnSaveNote");
            saveBtn.click();
            
            setTimeout(() => {
              const localNotes = window.localStorage.getItem('kb_offline_notes');
              check(localNotes && localNotes.includes("Auto Created Note"), "New note persisted to localStorage");
              
              if (allPass) {
                console.log("🎉 All full-flow tests passed including NEW NOTE!");
                process.exit(0);
              } else {
                console.log("Some tests failed.");
                process.exit(1);
              }
            }, 500);
          }, 500);
        }, 500);
      }, 500);
    }, 2000); // 2s wait for fetch and render
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});
