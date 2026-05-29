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
let currentNoteId = null;
let isEditing = false;

// DOM
const themeToggle = document.getElementById('themeToggle');
const searchInput = document.getElementById('searchInput');
const loadingState = document.getElementById('loadingState');

const dashboardView = document.getElementById('dashboardView');
const pinnedSection = document.getElementById('pinnedSection');
const pinnedGrid = document.getElementById('pinnedGrid');
const recentGrid = document.getElementById('recentGrid');
const foldersGrid = document.getElementById('foldersGrid');

const folderView = document.getElementById('folderView');
const btnBack = document.getElementById('btnBack');
const folderTitle = document.getElementById('folderTitle');
const folderNotesGrid = document.getElementById('folderNotesGrid');

const noteModal = document.getElementById('noteModal');
const btnCloseNote = document.getElementById('btnCloseNote');
const btnPinNote = document.getElementById('btnPinNote');
const btnEditNote = document.getElementById('btnEditNote');
const btnSaveNote = document.getElementById('btnSaveNote');
const modalNoteTitle = document.getElementById('modalNoteTitle');
const modalNoteContent = document.getElementById('modalNoteContent');
const modalNoteEditor = document.getElementById('modalNoteEditor');

// Theme
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) document.documentElement.setAttribute('data-theme', 'dark');

themeToggle.addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
});

// Init
async function init() {
  await fetchNotes();
  processData();
  renderDashboard();
}

async function fetchNotes() {
  let serverData = null;
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('kb_notes')
        .select('*')
        .order('last_modified', { ascending: false });
      if (!error && data && data.length > 0) {
        serverData = data;
      }
    } catch(e) {}
  }

  if (serverData) {
    notesData = serverData;
  } else {
    // Try localStorage first (offline edits)
    const local = localStorage.getItem('kb_offline_notes');
    if (local) {
      try {
        notesData = JSON.parse(local);
        return;
      } catch(e) {}
    }
    // Fallback to data.json
    try {
      const res = await fetch('data.json');
      if (res.ok) {
        notesData = await res.json();
        notesData.sort((a,b) => new Date(b.last_modified) - new Date(a.last_modified));
        return;
      }
    } catch(e) {}
    
    // Last resort mock data
    notesData = [
      { id: '1', title: '如何写出高质量的提示词', content: '---\npinned: true\n---\n# 提示词工程\n\n提示词工程是一门新兴的学科。', folder: 'AI', last_modified: new Date().toISOString() },
      { id: '2', title: '示例笔记', content: '这是一个没有任何后端的纯离线演示环境。点击编辑可以修改我！', folder: '演示', last_modified: new Date().toISOString() }
    ];
  }
}

function parseFrontmatter(content) {
  let pinned = false;
  let markdown = content;
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match) {
    const yaml = match[1];
    markdown = content.substring(match[0].length).trim();
    if (yaml.includes('pinned: true')) pinned = true;
  }
  return { pinned, markdown };
}

function processData() {
  foldersMap = {};
  notesData.forEach(note => {
    const f = note.folder || '默认分类';
    if (!foldersMap[f]) foldersMap[f] = [];
    foldersMap[f].push(note);
    
    const { pinned, markdown } = parseFrontmatter(note.content);
    note.isPinned = pinned;
    note.cleanMarkdown = markdown;
  });
}

function getPreview(text, len) {
  return text.replace(/#|\*|_|>|\[|\]|\n/g, ' ').substring(0, len).trim();
}

function getNoteCardHTML(note, index, isPinnedClass = false) {
  const preview = getPreview(note.cleanMarkdown, 80);
  const date = new Date(note.last_modified).toLocaleDateString();
  const cls = `card-base note-card anim-enter ${isPinnedClass ? 'pinned' : ''}`;
  const delay = `style="animation-delay: ${index * 0.05}s"`;
  
  return `
    <div class="${cls}" data-id="${note.id}" ${delay}>
      <div class="note-title">${note.title}</div>
      <div class="note-preview">${preview || '...'}</div>
      <div class="note-meta">${date} · ${note.folder}</div>
    </div>
  `;
}

function renderDashboard() {
  loadingState.classList.add('hidden');
  folderView.classList.add('hidden');
  dashboardView.classList.remove('hidden');

  // Folders
  const folders = Object.keys(foldersMap).sort();
  let foldersHtml = '';
  folders.forEach((f, i) => {
    foldersHtml += `
      <div class="card-base folder-card anim-enter" data-folder="${f}" style="animation-delay: ${i*0.03}s">
        <div class="folder-icon">📁</div>
        <div class="folder-name">${f}</div>
        <div class="folder-count">${foldersMap[f].length} 篇</div>
      </div>
    `;
  });
  foldersGrid.innerHTML = foldersHtml;

  // Pinned
  const pinnedNotes = notesData.filter(n => n.isPinned);
  if (pinnedNotes.length > 0) {
    pinnedSection.classList.remove('hidden');
    pinnedGrid.innerHTML = pinnedNotes.map((n, i) => getNoteCardHTML(n, i, true)).join('');
  } else {
    pinnedSection.classList.add('hidden');
  }

  // Recent
  const recentNotes = notesData.slice(0, 8);
  recentGrid.innerHTML = recentNotes.map((n, i) => getNoteCardHTML(n, i)).join('');

  bindCardClicks();
}

function openFolder(folderName) {
  currentFolder = folderName;
  folderTitle.textContent = folderName;
  dashboardView.classList.add('hidden');
  folderView.classList.remove('hidden');
  
  const notes = foldersMap[folderName] || [];
  folderNotesGrid.innerHTML = notes.map((n, i) => getNoteCardHTML(n, i)).join('');
  bindCardClicks(folderView);
}

function bindCardClicks(container = document) {
  container.querySelectorAll('.folder-card').forEach(el => {
    el.addEventListener('click', () => openFolder(el.dataset.folder));
  });
  container.querySelectorAll('.note-card').forEach(el => {
    el.addEventListener('click', () => openNote(el.dataset.id));
  });
}

function openNote(id) {
  const note = notesData.find(n => n.id === id);
  if (!note) return;
  
  currentNoteId = id;
  isEditing = false;
  modalNoteTitle.textContent = note.title;
  
  if (note.isPinned) {
    btnPinNote.classList.add('active');
  } else {
    btnPinNote.classList.remove('active');
  }
  
  let parsedContent = note.cleanMarkdown.replace(/\[\[(.*?)\]\]/g, (match, inner) => {
    const parts = inner.split('|');
    const target = parts[0];
    const display = parts[1] || target;
    return `<a href="#" class="internal-link" data-target="${target}">${display}</a>`;
  });
  
  modalNoteContent.innerHTML = marked.parse(parsedContent);
  modalNoteEditor.value = note.content;
  
  if (window.hljs) {
    modalNoteContent.querySelectorAll('pre code').forEach(window.hljs.highlightElement);
  }
  
  modalNoteContent.querySelectorAll('.internal-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const rawTarget = e.target.dataset.target.toLowerCase();
      const targetNote = notesData.find(n => {
        const idLower = n.id.toLowerCase();
        return n.title.toLowerCase() === rawTarget || idLower.endsWith('/' + rawTarget + '.md') || idLower.replace(/\.md$/, '') === rawTarget;
      });
      if (targetNote) openNote(targetNote.id);
      else alert(`未找到笔记: ${e.target.dataset.target}`);
    });
  });
  
  modalNoteContent.classList.remove('hidden');
  modalNoteEditor.classList.add('hidden');
  btnEditNote.classList.remove('hidden');
  btnSaveNote.classList.add('hidden');
  
  noteModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeNote() {
  noteModal.classList.remove('open');
  document.body.style.overflow = '';
  currentNoteId = null;
}

function toggleEdit() {
  if (!currentNoteId) return;
  isEditing = !isEditing;
  if (isEditing) {
    modalNoteContent.classList.add('hidden');
    modalNoteEditor.classList.remove('hidden');
    btnEditNote.classList.add('hidden');
    btnSaveNote.classList.remove('hidden');
    modalNoteEditor.focus();
  } else {
    openNote(currentNoteId); // reset view
  }
}

async function togglePin() {
  if (!currentNoteId) return;
  const note = notesData.find(n => n.id === currentNoteId);
  
  let newContent = note.content;
  const hasFrontmatter = /^---\n([\s\S]*?)\n---/.test(newContent);
  
  if (hasFrontmatter) {
    if (!note.isPinned) {
      if (!newContent.includes('pinned: true')) newContent = newContent.replace(/^---\n/, '---\npinned: true\n');
    } else {
      newContent = newContent.replace(/\npinned: true\n?/, '\n');
    }
  } else {
    if (!note.isPinned) {
      newContent = `---\npinned: true\n---\n\n${newContent}`;
    }
  }
  
  await saveNote(newContent);
}

async function saveNote(overrideContent = null) {
  if (!currentNoteId) return;
  const newContent = overrideContent || modalNoteEditor.value;
  const noteIndex = notesData.findIndex(n => n.id === currentNoteId);
  
  notesData[noteIndex].content = newContent;
  notesData[noteIndex].last_modified = new Date().toISOString();
  
  const { pinned, markdown } = parseFrontmatter(newContent);
  notesData[noteIndex].isPinned = pinned;
  notesData[noteIndex].cleanMarkdown = markdown;
  
  // Persist locally for offline reliability
  localStorage.setItem('kb_offline_notes', JSON.stringify(notesData));
  
  if (supabaseClient) {
    try {
      await supabaseClient.from('kb_notes')
        .update({ content: newContent, last_modified: notesData[noteIndex].last_modified })
        .eq('id', currentNoteId);
    } catch (e) {}
  }
  
  processData();
  if (currentFolder) openFolder(currentFolder);
  else renderDashboard();
  
  openNote(currentNoteId);
}

// Search
searchInput.addEventListener('input', (e) => {
  const val = e.target.value.toLowerCase().trim();
  if (!val) {
    if (currentFolder) openFolder(currentFolder);
    else renderDashboard();
    return;
  }
  
  dashboardView.classList.add('hidden');
  folderView.classList.remove('hidden');
  folderTitle.textContent = '搜索结果';
  
  const results = notesData.filter(n => 
    n.title.toLowerCase().includes(val) || n.content.toLowerCase().includes(val)
  );
  folderNotesGrid.innerHTML = results.map((n, i) => getNoteCardHTML(n, i)).join('');
  bindCardClicks(folderView);
});

btnBack.addEventListener('click', () => {
  currentFolder = null;
  searchInput.value = '';
  renderDashboard();
});

btnCloseNote.addEventListener('click', closeNote);
btnPinNote.addEventListener('click', togglePin);
btnEditNote.addEventListener('click', toggleEdit);
btnSaveNote.addEventListener('click', () => saveNote());
noteModal.addEventListener('click', e => { if (e.target === noteModal) closeNote(); });

init();
