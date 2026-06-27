import crypto from "node:crypto";
import fs from "node:fs";

const TASKS_FILE = "TASKS.md";
const API_ROOT = "https://api.github.com";
const TOKEN = process.env.GITHUB_TOKEN;
const REPOSITORY = process.env.GITHUB_REPOSITORY;
const RUN_ID = process.env.GITHUB_RUN_ID || "";
const VALID_STATES = new Set(["pendiente", "en_proceso", "ejecutada", "error", "descartada"]);

if (!TOKEN) throw new Error("GITHUB_TOKEN is required");
if (!REPOSITORY || !REPOSITORY.includes("/")) throw new Error("GITHUB_REPOSITORY is required");
if (!fs.existsSync(TASKS_FILE)) throw new Error(`${TASKS_FILE} does not exist`);

const [owner, repo] = REPOSITORY.split("/");
const labels = [
  { name: "mobile-task", color: "7057ff", description: "Tarea capturada desde TASKS.md" },
  { name: "codex", color: "1d76db", description: "Trabajo preparado para Codex" },
  { name: "estado:en_proceso", color: "fbca04", description: "Tarea preparada y pendiente de Codex" },
  { name: "estado:error", color: "d73a4a", description: "Tarea con error de automatizacion" },
];

const original = fs.readFileSync(TASKS_FILE, "utf8");
const lines = original.split(/\r?\n/);
const output = [];
const seenIds = new Set();
let labelsReady = false;

for (const line of lines) {
  const task = parseTaskLine(line);

  if (!task) {
    output.push(line);
    continue;
  }

  const id = task.meta.id || stableId(task.text);
  const state = normalizeState(task.meta.estado || (task.checked ? "ejecutada" : "pendiente"));
  const issueNumber = Number(task.meta.issue || 0);

  if (seenIds.has(id)) {
    output.push(formatTaskLine(task, {
      id,
      estado: "error",
      issue: task.meta.issue,
      error: "duplicada",
    }));
    continue;
  }

  seenIds.add(id);

  try {
    if (state === "pendiente") {
      if (!labelsReady) {
        await ensureLabels(labels);
        labelsReady = true;
      }

      const issue = await createIssue({ id, text: task.text });
      output.push(formatTaskLine(task, {
        id,
        estado: "en_proceso",
        issue: String(issue.number),
        updated: now(),
      }));
      continue;
    }

    if (state === "en_proceso" && issueNumber) {
      const issue = await getIssue(issueNumber);
      const nextState = issue.state === "closed" ? closedIssueState(issue) : "en_proceso";

      output.push(formatTaskLine(task, {
        id,
        estado: nextState,
        issue: String(issueNumber),
        updated: nextState === state ? task.meta.updated : now(),
      }));
      continue;
    }

    if (!VALID_STATES.has(state)) {
      output.push(formatTaskLine(task, {
        id,
        estado: "error",
        issue: task.meta.issue,
        error: "estado_invalido",
        updated: now(),
      }));
      continue;
    }

    output.push(formatTaskLine(task, {
      ...task.meta,
      id,
      estado: state,
    }));
  } catch (error) {
    output.push(formatTaskLine(task, {
      id,
      estado: "error",
      issue: task.meta.issue || "",
      error: normalizeError(error),
      updated: now(),
    }));
  }
}

const next = output.join("\n");
if (next !== original) fs.writeFileSync(TASKS_FILE, next, "utf8");

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

  if (meta.issue) parts.push(`issue=${meta.issue}`);
  if (meta.updated) parts.push(`updated=${meta.updated}`);
  if (meta.error) parts.push(`error=${sanitizeMeta(meta.error)}`);

  return `${task.indent}- [${checked}] ${task.text} <!-- codex-task:${parts.join(" ")} -->`;
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

function sanitizeMeta(value) {
  return String(value || "error")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "error";
}

function normalizeError(error) {
  return sanitizeMeta(error?.message || "error");
}

function closedIssueState(issue) {
  if (issue.state_reason === "not_planned") return "descartada";
  return "ejecutada";
}

async function ensureLabels(items) {
  for (const label of items) {
    const existing = await github(`/repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`, {
      method: "GET",
      okStatuses: [200, 404],
    });

    if (existing.status === 404) {
      await github(`/repos/${owner}/${repo}/labels`, {
        method: "POST",
        body: label,
      });
    }
  }
}

async function createIssue(task) {
  const title = task.text.length > 80 ? `${task.text.slice(0, 77)}...` : task.text;

  const response = await github(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: {
      title: `[TASKS.md] ${title}`,
      labels: ["mobile-task", "codex", "estado:en_proceso"],
      body: [
        `Tarea capturada desde \`${TASKS_FILE}\`.`,
        "",
        `Task ID: \`${task.id}\``,
        `Run: ${RUN_ID ? `https://github.com/${owner}/${repo}/actions/runs/${RUN_ID}` : "manual"}`,
        "",
        "## Tarea",
        task.text,
        "",
        "## Instrucciones para Codex",
        "- Leer el contexto actual del repositorio antes de cambiar archivos.",
        "- Implementar solo esta tarea, sin ampliar alcance.",
        "- Crear una rama nueva para el cambio.",
        "- Abrir Pull Request contra `main`.",
        "- No hacer push directo a `main`.",
        "- Ejecutar los checks disponibles antes de abrir el PR.",
        "- Si la tarea es peligrosa, ambigua o grande, comentar el bloqueo en este Issue en vez de ejecutarla.",
        "",
        "## Cierre",
        "- Cerrar este Issue como completado cuando el PR quede listo o mergeado.",
        "- Cerrar como no planificado si la tarea debe descartarse.",
      ].join("\n"),
    },
  });

  return response.data;
}

async function getIssue(number) {
  const response = await github(`/repos/${owner}/${repo}/issues/${number}`, {
    method: "GET",
  });

  return response.data;
}

async function github(path, options) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "mobile-tasks-runner",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const okStatuses = options.okStatuses || [200, 201];

  if (!okStatuses.includes(response.status)) {
    throw new Error(data?.message || `GitHub API error ${response.status}`);
  }

  return { status: response.status, data };
}
