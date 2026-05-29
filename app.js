const SUPABASE_URL = 'https://owqhouyafggdzgcqwlji.supabase.co';
const SUPABASE_KEY = 'sb_publishable_QgsSE7ZoIfcaPsJLlkfS5w_tGvRz_I6';
let supabaseClient = null;

if (window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// State
let notesData = [];
let foldersMap = {};
let currentFolder = null;

// DOM Elements
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const loadingState = document.getElementById('loadingState');
const foldersContainer = document.getElementById('foldersContainer');
const notesContainer = document.getElementById('notesContainer');
const notesGrid = document.getElementById('notesGrid');
const btnBackToFolders = document.getElementById('btnBackToFolders');
const currentFolderName = document.getElementById('currentFolderName');

const noteModal = document.getElementById('noteModal');
const btnCloseNote = document.getElementById('btnCloseNote');
const btnEditNote = document.getElementById('btnEditNote');
const btnSaveNote = document.getElementById('btnSaveNote');
const modalNoteTitle = document.getElementById('modalNoteTitle');
const modalNoteContent = document.getElementById('modalNoteContent');
const modalNoteEditor = document.getElementById('modalNoteEditor');

let currentNoteId = null;
let isEditing = false;

// Theme toggle
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark');

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
});

// Initialization
async function init() {
  await fetchNotes();
  processData();
  renderFolders();
}

async function fetchNotes() {
  if (!supabaseClient) {
    await tryLoadLocalData();
    return;
  }
  
  try {
    const { data, error } = await supabaseClient
      .from('kb_notes')
      .select('*')
      .order('last_modified', { ascending: false });
      
    if (error) throw error;
    
    if (!data || data.length === 0) {
      await tryLoadLocalData(); // fallback if empty table
    } else {
      notesData = data;
    }
  } catch (err) {
    console.warn('Failed to fetch from Supabase (table might not exist). Falling back to local data.json.');
    await tryLoadLocalData();
  }
}

async function tryLoadLocalData() {
  try {
    const res = await fetch('data.json');
    if (res.ok) {
      notesData = await res.json();
      notesData.sort((a,b) => new Date(b.last_modified) - new Date(a.last_modified));
      return;
    }
  } catch (e) {
    console.warn("No data.json found locally.");
  }
  showDemoData();
}

function showDemoData() {
  // Demo data while user hasn't synced
  notesData = [
    { id: '1', title: '如何写出高质量的提示词', content: '# 提示词工程\\n\\n提示词工程是一门新兴的学科，主要目的是为了让AI产生更高质量的输出。\\n\\n## 核心原则\\n- 明确具体\\n- 给予上下文\\n- 提供示例', folder: '提示词', last_modified: new Date().toISOString() },
    { id: '2', title: '大语言模型的发展史', content: '大语言模型（LLM）从GPT-1发展到如今的GPT-4，经历了飞速的发展。模型参数量呈指数级增长。', folder: '大模型', last_modified: new Date().toISOString() },
    { id: '3', title: '名人名言', content: '> 敏而好学，不耻下问。——孔子\\n\\n> 想象力比知识更重要。——爱因斯坦', folder: '学习', last_modified: new Date().toISOString() },
    { id: '4', title: '学习方法总结', content: '费曼技巧：用最简单的语言向别人解释一个概念。如果对方听不懂，说明你还没有真正掌握。', folder: '学习', last_modified: new Date().toISOString() },
    { id: '5', title: 'React 状态管理', content: '在复杂的React应用中，状态管理是个大问题。常用的有Redux, Zustand, Recoil等。', folder: '技术', last_modified: new Date().toISOString() },
  ];
}

function processData() {
  foldersMap = {};
  notesData.forEach(note => {
    const f = note.folder || '默认分类';
    if (!foldersMap[f]) foldersMap[f] = [];
    foldersMap[f].push(note);
  });
}

function renderFolders() {
  loadingState.classList.add('hidden');
  notesContainer.classList.add('hidden');
  foldersContainer.classList.remove('hidden');
  
  const folders = Object.keys(foldersMap).sort();
  
  let html = '';
  folders.forEach((f, i) => {
    const count = foldersMap[f].length;
    html += `
      <div class="folder-card" data-folder="${f}" style="animation: fadeUp 0.4s ease forwards ${i * 0.05}s; opacity: 0; transform: translateY(20px);">
        <div class="folder-icon">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <div class="folder-name">${f}</div>
        <div class="folder-count">${count} 篇笔记</div>
      </div>
    `;
  });
  
  foldersContainer.innerHTML = html;
  
  // Add global animation style if not exists
  if (!document.getElementById('animStyles')) {
    const style = document.createElement('style');
    style.id = 'animStyles';
    style.innerHTML = `@keyframes fadeUp { to { opacity: 1; transform: translateY(0); } }`;
    document.head.appendChild(style);
  }
  
  // Event listeners
  document.querySelectorAll('.folder-card').forEach(el => {
    el.addEventListener('click', () => {
      openFolder(el.dataset.folder);
    });
  });
}

function openFolder(folderName) {
  currentFolder = folderName;
  currentFolderName.textContent = folderName;
  foldersContainer.classList.add('hidden');
  notesContainer.classList.remove('hidden');
  
  renderNotes(foldersMap[folderName] || []);
}

function renderNotes(notes) {
  let html = '';
  notes.forEach((note, i) => {
    // Strip markdown formatting for preview
    let preview = note.content.replace(/#|\*|_|>|\\n/g, ' ').substring(0, 100);
    html += `
      <div class="note-card" data-id="${note.id}" style="animation: fadeUp 0.4s ease forwards ${i * 0.05}s; opacity: 0; transform: translateX(-20px);">
        <div class="note-title">${note.title}</div>
        <div class="note-preview">${preview}...</div>
      </div>
    `;
  });
  
  notesGrid.innerHTML = html;
  
  document.querySelectorAll('.note-card').forEach(el => {
    el.addEventListener('click', () => {
      openNote(el.dataset.id);
    });
  });
}

function openNote(id) {
  const note = notesData.find(n => n.id === id);
  if (!note) return;
  
  currentNoteId = id;
  isEditing = false;
  modalNoteTitle.textContent = note.title;
  
  // Parse wiki links [[Note Title]]
  let parsedContent = note.content.replace(/\[\[(.*?)\]\]/g, (match, title) => {
    return `<a href="#" class="internal-link" data-target="${title}">${title}</a>`;
  });
  
  // Parse markdown
  modalNoteContent.innerHTML = marked.parse(parsedContent);
  modalNoteEditor.value = note.content;
  
  // Setup internal link clicks
  modalNoteContent.querySelectorAll('.internal-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTitle = e.target.dataset.target;
      const targetNote = notesData.find(n => n.title.toLowerCase() === targetTitle.toLowerCase());
      if (targetNote) {
        openNote(targetNote.id);
      } else {
        alert(`未找到笔记: ${targetTitle}`);
      }
    });
  });
  
  // Reset UI states
  modalNoteContent.classList.remove('hidden');
  modalNoteEditor.classList.add('hidden');
  btnEditNote.classList.remove('hidden');
  btnSaveNote.classList.add('hidden');
  
  noteModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function toggleEditMode() {
  if (!currentNoteId) return;
  isEditing = !isEditing;
  
  if (isEditing) {
    modalNoteContent.classList.add('hidden');
    modalNoteEditor.classList.remove('hidden');
    btnEditNote.classList.add('hidden');
    btnSaveNote.classList.remove('hidden');
    modalNoteEditor.focus();
  } else {
    modalNoteContent.classList.remove('hidden');
    modalNoteEditor.classList.add('hidden');
    btnEditNote.classList.remove('hidden');
    btnSaveNote.classList.add('hidden');
  }
}

async function saveNote() {
  if (!currentNoteId) return;
  
  const newContent = modalNoteEditor.value;
  const noteIndex = notesData.findIndex(n => n.id === currentNoteId);
  if (noteIndex === -1) return;
  
  // Update local memory
  notesData[noteIndex].content = newContent;
  notesData[noteIndex].last_modified = new Date().toISOString();
  
  // Try to update Supabase
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('kb_notes')
        .update({ content: newContent, last_modified: notesData[noteIndex].last_modified })
        .eq('id', currentNoteId);
        
      if (error) {
        console.warn('Failed to save to Supabase:', error);
        alert('由于未连接数据库，已在本地暂存，刷新后将丢失。');
      }
    } catch (e) {
      console.warn(e);
    }
  } else {
    alert('由于未连接数据库，已在本地暂存，刷新后将丢失。');
  }
  
  // Switch back to view mode and re-render
  openNote(currentNoteId);
}

function closeNote() {
  noteModal.classList.remove('open');
  document.body.style.overflow = '';
  currentNoteId = null;
  isEditing = false;
}

// Search
searchInput.addEventListener('input', (e) => {
  const val = e.target.value.toLowerCase().trim();
  
  if (!val) {
    if (currentFolder) {
      openFolder(currentFolder);
    } else {
      renderFolders();
    }
    return;
  }
  
  // Searching
  foldersContainer.classList.add('hidden');
  notesContainer.classList.remove('hidden');
  currentFolderName.textContent = '搜索结果';
  
  const results = notesData.filter(n => 
    n.title.toLowerCase().includes(val) || 
    n.content.toLowerCase().includes(val)
  );
  
  renderNotes(results);
});

// Event Listeners
btnBackToFolders.addEventListener('click', () => {
  currentFolder = null;
  searchInput.value = '';
  renderFolders();
});

btnCloseNote.addEventListener('click', closeNote);
btnEditNote.addEventListener('click', toggleEditMode);
btnSaveNote.addEventListener('click', saveNote);

noteModal.addEventListener('click', (e) => {
  if (e.target === noteModal) closeNote();
});

// Start
init();
