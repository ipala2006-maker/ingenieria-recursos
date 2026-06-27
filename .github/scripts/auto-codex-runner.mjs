import crypto from "node:crypto";
import fs from "node:fs";

const TASKS_FILE = "TASKS.md";
const API_ROOT = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.GITHUB_REPOSITORY;
const MODE = process.argv[2] || "select";
const VALID_STATES = new Set(["pendiente", "en_proceso", "ejecutada", "error", "descartada"]);

if (!REPOSITORY || !REPOSITORY.includes("/")) throw new Error("GITHUB_REPOSITORY is required");
if (!fs.existsSync(TASKS_FILE)) throw new Error(`${TASKS_FILE} does not exist`);

const [owner, repo] = REPOSITORY.split("/");

if (MODE === "select") {
  await selectTask();
} else if (MODE === "mark") {
  markTask();
} else {
  throw new Error(`Unknown mode: ${MODE}`);
}

async function selectTask() {
  if (!TOKEN) throw new Error("GITHUB_TOKEN is required in select mode");

  const tasks = readTasks();
  const duplicateIds = findDuplicateIds(tasks);

  for (const task of tasks) {
    const id = task.meta.id || stableId(task.text);
    const state = normalizeState(task.meta.estado || (task.checked ? "ejecutada" : "pendiente"));

    if (duplicateIds.has(id) || state !== "pendiente") continue;

    const branch = `codex/task-${id}`;
    const branchExists = await remoteBranchExists(branch);

    if (branchExists) continue;

    writeOutput("has_task", "true");
    writeOutput("task_id", id);
    writeOutput("task_text", task.text);
    writeOutput("branch_name", branch);
    writeOutput("prompt", buildPrompt({ id, text: task.text, branch }));
    return;
  }

  writeOutput("has_task", "false");
}

function markTask() {
  const id = requireEnv("TASK_ID");
  const state = normalizeState(requireEnv("TASK_STATE"));
  const branch = process.env.TASK_BRANCH || "";
  const pr = process.env.TASK_PR || "";
  const error = process.env.TASK_ERROR || "";

  const original = fs.readFileSync(TASKS_FILE, "utf8");
  const lines = original.split(/\r?\n/);
  let found = false;

  const next = lines.map((line) => {
    const task = parseTaskLine(line);
    if (!task) return line;

    const taskId = task.meta.id || stableId(task.text);
    if (taskId !== id) return line;

    found = true;
    return formatTaskLine(task, {
      ...task.meta,
      id,
      estado: state,
      branch,
      pr,
      error: state === "error" ? error || "codex_failed" : "",
      updated: now(),
    });
  }).join("\n");

  if (!found) throw new Error(`Task not found: ${id}`);
  if (next !== original) fs.writeFileSync(TASKS_FILE, next, "utf8");
}

function readTasks() {
  return fs
    .readFileSync(TASKS_FILE, "utf8")
    .split(/\r?\n/)
    .map(parseTaskLine)
    .filter(Boolean);
}

function parseTaskLine(line) {
  const match = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.+?)(?:\s*<!--\s*codex-task:([^>]*)\s*-->)?\s*$/);
  if (!match) return null;

  return {
    indent: match[1],
    checked: match[2].toLowerCase() === "x",
    text: stripComment(match[3]).trim(),
    meta: parseMeta(match[4] || ""),
  };
}

function stripComment(text) {
  return text.replace(/\s*<!--\s*codex-task:[^>]*\s*-->\s*$/, "");
}

function parseMeta(metaText) {
  const meta = {};

  for (const part of metaText.split(/\s+/).filter(Boolean)) {
    const [key, ...rawValue] = part.split("=");
    if (!key || rawValue.length === 0) continue;
    meta[key] = rawValue.join("=");
  }

  return meta;
}

function formatTaskLine(task, meta) {
  const state = normalizeState(meta.estado || "pendiente");
  const checked = state === "ejecutada" ? "x" : " ";
  const parts = [
    `id=${meta.id}`,
    `estado=${state}`,
  ];

  if (meta.branch) parts.push(`branch=${sanitizeMeta(meta.branch, 80)}`);
  if (meta.pr) parts.push(`pr=${sanitizeMeta(meta.pr, 120)}`);
  if (meta.updated) parts.push(`updated=${meta.updated}`);
  if (meta.error) parts.push(`error=${sanitizeMeta(meta.error, 80)}`);

  return `${task.indent}- [${checked}] ${task.text} <!-- codex-task:${parts.join(" ")} -->`;
}

function findDuplicateIds(tasks) {
  const counts = new Map();

  for (const task of tasks) {
    const id = task.meta.id || stableId(task.text);
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id));
}

function buildPrompt(task) {
  return [
    "Trabaja en el repositorio Estudiemos.",
    "",
    `Tarea de TASKS.md: ${task.text}`,
    `Task ID: ${task.id}`,
    `Rama de trabajo esperada: ${task.branch}`,
    "",
    "Reglas obligatorias:",
    "- Implementa solamente esta tarea; no amplíes alcance.",
    "- Haz cambios chicos, seguros y reversibles.",
    "- No borres archivos o carpetas masivamente.",
    "- No leas, imprimas ni modifiques secrets, tokens, credenciales ni variables sensibles.",
    "- No modifiques autenticación, base de datos, dependencias, configuración crítica ni workflows salvo que la tarea lo pida explícitamente.",
    "- No hagas commit, push ni abras PR; GitHub Actions se encarga de eso.",
    "- Si la tarea es ambigua, peligrosa o demasiado grande, no hagas cambios de código y deja una explicación breve en tu respuesta final.",
    "- Ejecuta los checks disponibles si existen.",
    "",
    "Entrega esperada:",
    "- Cambios aplicados en el workspace.",
    "- Respuesta final corta con qué cambiaste y cómo lo verificaste.",
  ].join("\n");
}

function normalizeState(state) {
  return VALID_STATES.has(state) ? state : "error";
}

function stableId(text) {
  return crypto
    .createHash("sha1")
    .update(text.trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

function now() {
  return new Date().toISOString();
}

function sanitizeMeta(value, max = 60) {
  return String(value || "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/g, "_")
    .slice(0, max);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function writeOutput(key, value) {
  const output = process.env.GITHUB_OUTPUT;

  if (!output) {
    console.log(`${key}=${value}`);
    return;
  }

  if (String(value).includes("\n")) {
    const delimiter = `EOF_${crypto.randomBytes(8).toString("hex")}`;
    fs.appendFileSync(output, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
  } else {
    fs.appendFileSync(output, `${key}=${value}\n`);
  }
}

async function remoteBranchExists(branch) {
  const response = await github(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, {
    method: "GET",
    okStatuses: [200, 404],
  });

  return response.status === 200;
}

async function github(path, options) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "auto-codex-runner",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const okStatuses = options.okStatuses || [200, 201];

  if (!okStatuses.includes(response.status)) {
    throw new Error(data?.message || `GitHub API error ${response.status}`);
  }

  return { status: response.status, data };
}
