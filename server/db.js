import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || './storage');
const DB_PATH = path.join(STORAGE_DIR, 'db.json');

const DEFAULT_DB = {
  users: [],
  projects: [],
  clips: [],
  livestreams: [],
  transactions: [],
};

let dbCache = null;
let writeQueue = Promise.resolve();

export function ensureStorageDirs() {
  const dirs = [
    STORAGE_DIR,
    path.join(STORAGE_DIR, 'uploads'),
    path.join(STORAGE_DIR, 'clips'),
    path.join(STORAGE_DIR, 'thumbs'),
    path.join(STORAGE_DIR, 'subs'),
    path.join(STORAGE_DIR, 'music'),
    path.join(STORAGE_DIR, 'livestreams'),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getStoragePaths() {
  ensureStorageDirs();
  return {
    root: STORAGE_DIR,
    uploads: path.join(STORAGE_DIR, 'uploads'),
    clips: path.join(STORAGE_DIR, 'clips'),
    thumbs: path.join(STORAGE_DIR, 'thumbs'),
    subs: path.join(STORAGE_DIR, 'subs'),
    music: path.join(STORAGE_DIR, 'music'),
    livestreams: path.join(STORAGE_DIR, 'livestreams'),
  };
}

function loadDb() {
  ensureStorageDirs();
  if (dbCache) return dbCache;
  if (!fs.existsSync(DB_PATH)) {
    dbCache = structuredClone(DEFAULT_DB);
    fs.writeFileSync(DB_PATH, JSON.stringify(dbCache, null, 2), 'utf8');
    return dbCache;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    dbCache = {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      clips: Array.isArray(parsed.clips) ? parsed.clips : [],
      livestreams: Array.isArray(parsed.livestreams) ? parsed.livestreams : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
    return dbCache;
  } catch {
    dbCache = structuredClone(DEFAULT_DB);
    return dbCache;
  }
}

function persistDb() {
  const snapshot = JSON.stringify(dbCache, null, 2);
  writeQueue = writeQueue.then(async () => {
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.promises.writeFile(tmpPath, snapshot, 'utf8');
    await fs.promises.rename(tmpPath, DB_PATH);
  });
  return writeQueue;
}

export function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

export function findUserByEmail(email) {
  const db = loadDb();
  const normalized = String(email || '').trim().toLowerCase();
  return db.users.find((u) => u.email === normalized) || null;
}

export function findUserById(id) {
  const db = loadDb();
  return db.users.find((u) => u.id === id) || null;
}

export async function createUser({ name, email, passwordHash }) {
  const db = loadDb();
  const now = new Date().toISOString();
  const user = {
    id: uuidv4(),
    name: String(name || 'Creator').trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash,
    plan: 'starter',
    credits: 120,
    settings: {
      defaultLanguage: 'english',
      defaultFormat: '9:16',
      defaultCaptionStyle: 'neon_pop',
      autoSplitScreen: true,
      exportQuality: '1080p',
    },
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  db.transactions.unshift({
    id: uuidv4(),
    userId: user.id,
    type: 'credit_grant',
    amount: 120,
    description: 'Welcome starter credits',
    createdAt: now,
  });
  await persistDb();
  return user;
}

export async function updateUser(userId, patch) {
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  db.users[idx] = {
    ...db.users[idx],
    ...patch,
    settings: patch.settings
      ? { ...db.users[idx].settings, ...patch.settings }
      : db.users[idx].settings,
    updatedAt: new Date().toISOString(),
  };
  await persistDb();
  return db.users[idx];
}

export async function adjustUserCredits(userId, delta, description, type = 'credit_usage') {
  const db = loadDb();
  const idx = db.users.findIndex((u) => u.id === userId);
  if (idx === -1) return null;
  const nextCredits = Math.max(0, (db.users[idx].credits || 0) + delta);
  db.users[idx].credits = nextCredits;
  db.users[idx].updatedAt = new Date().toISOString();
  db.transactions.unshift({
    id: uuidv4(),
    userId,
    type,
    amount: delta,
    description,
    createdAt: new Date().toISOString(),
  });
  await persistDb();
  return db.users[idx];
}

export function listTransactionsByUser(userId) {
  const db = loadDb();
  return db.transactions.filter((t) => t.userId === userId).slice(0, 50);
}

export async function createProject(projectData) {
  const db = loadDb();
  const now = new Date().toISOString();
  const project = {
    id: projectData.id || uuidv4(),
    status: 'queued',
    progress: 0,
    stage: 'Queued for processing',
    error: null,
    clipsCount: 0,
    createdAt: now,
    updatedAt: now,
    ...projectData,
  };
  db.projects.unshift(project);
  await persistDb();
  return project;
}

export async function updateProject(projectId, patch) {
  const db = loadDb();
  const idx = db.projects.findIndex((p) => p.id === projectId);
  if (idx === -1) return null;
  db.projects[idx] = {
    ...db.projects[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await persistDb();
  return db.projects[idx];
}

export function getProjectById(projectId) {
  const db = loadDb();
  return db.projects.find((p) => p.id === projectId) || null;
}

export function listProjectsByUser(userId) {
  const db = loadDb();
  return db.projects
    .filter((p) => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteProjectById(projectId, userId) {
  const db = loadDb();
  const project = db.projects.find((p) => p.id === projectId && p.userId === userId);
  if (!project) return false;
  db.projects = db.projects.filter((p) => p.id !== projectId);
  const relatedClips = db.clips.filter((c) => c.projectId === projectId);
  for (const clip of relatedClips) {
    if (clip.outputPath && fs.existsSync(clip.outputPath)) {
      fs.unlink(clip.outputPath, () => {});
    }
    if (clip.thumbPath && fs.existsSync(clip.thumbPath)) {
      fs.unlink(clip.thumbPath, () => {});
    }
  }
  db.clips = db.clips.filter((c) => c.projectId !== projectId);
  if (project.sourcePath && fs.existsSync(project.sourcePath)) {
    fs.unlink(project.sourcePath, () => {});
  }
  await persistDb();
  return true;
}

export async function createClip(clipData) {
  const db = loadDb();
  const now = new Date().toISOString();
  const clip = {
    id: clipData.id || uuidv4(),
    createdAt: now,
    updatedAt: now,
    ...clipData,
  };
  db.clips.unshift(clip);
  await persistDb();
  return clip;
}

export async function updateClip(clipId, patch) {
  const db = loadDb();
  const idx = db.clips.findIndex((c) => c.id === clipId);
  if (idx === -1) return null;
  db.clips[idx] = {
    ...db.clips[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await persistDb();
  return db.clips[idx];
}

export function getClipById(clipId) {
  const db = loadDb();
  return db.clips.find((c) => c.id === clipId) || null;
}

export function listClipsByProject(projectId) {
  const db = loadDb();
  return db.clips
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => (b.viralScore || 0) - (a.viralScore || 0));
}

export function listClipsByUser(userId) {
  const db = loadDb();
  return db.clips
    .filter((c) => c.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function deleteClipById(clipId, userId) {
  const db = loadDb();
  const clip = db.clips.find((c) => c.id === clipId && c.userId === userId);
  if (!clip) return false;
  if (clip.outputPath && fs.existsSync(clip.outputPath)) {
    fs.unlink(clip.outputPath, () => {});
  }
  if (clip.thumbPath && fs.existsSync(clip.thumbPath)) {
    fs.unlink(clip.thumbPath, () => {});
  }
  db.clips = db.clips.filter((c) => c.id !== clipId);
  await persistDb();
  return true;
}

export async function createLivestream(streamData) {
  const db = loadDb();
  const now = new Date().toISOString();
  const stream = {
    id: streamData.id || uuidv4(),
    status: 'active',
    segmentsProcessed: 0,
    clipsGenerated: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    ...streamData,
  };
  db.livestreams.unshift(stream);
  await persistDb();
  return stream;
}

export async function updateLivestream(streamId, patch) {
  const db = loadDb();
  const idx = db.livestreams.findIndex((s) => s.id === streamId);
  if (idx === -1) return null;
  db.livestreams[idx] = {
    ...db.livestreams[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await persistDb();
  return db.livestreams[idx];
}

export function getLivestreamById(streamId) {
  const db = loadDb();
  return db.livestreams.find((s) => s.id === streamId) || null;
}

export function listLivestreamsByUser(userId) {
  const db = loadDb();
  return db.livestreams
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}
