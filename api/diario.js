const OWNER = process.env.GITHUB_OWNER || "ipala2006-maker";
const REPO = process.env.GITHUB_REPO || "ingenieria-recursos";
const TOKEN = process.env.GITHUB_TOKEN || process.env.DIARIO_GITHUB_TOKEN;
const SHARED_KEY = process.env.DIARIO_SHARED_KEY || "";
const LABEL = "ian-inbox";
const API_ROOT = "https://api.github.com";

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!TOKEN) {
    send(res, 500, { error: "Missing DIARIO_GITHUB_TOKEN or GITHUB_TOKEN" });
    return;
  }

  if (SHARED_KEY && req.headers["x-diario-key"] !== SHARED_KEY) {
    send(res, 401, { error: "Invalid Diario key" });
    return;
  }

  try {
    await ensureLabel();

    if (req.method === "GET") {
      const items = await listEntries();
      send(res, 200, { items });
      return;
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const entry = normalizeEntry(body);

      if (!entry.text) {
        send(res, 400, { error: "Text is required" });
        return;
      }

      const issue = await createEntry(entry);
      send(res, 201, { item: issueToEntry(issue) });
      return;
    }

    if (req.method === "PATCH") {
      const body = await readBody(req);
      const number = Number(body.number);
      const status = normalizeStatus(body.status);

      if (!number || !status) {
        send(res, 400, { error: "Issue number and status are required" });
        return;
      }

      const issue = await updateEntry(number, status);
      send(res, 200, { item: issueToEntry(issue) });
      return;
    }

    send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    send(res, error.status || 500, { error: error.message || "Unexpected error" });
  }
};

function setCors(req, res) {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,x-diario-key");
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 20000) {
        reject(Object.assign(new Error("Request too large"), { status: 413 }));
      }
    });

    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
  });
}

function normalizeEntry(body) {
  return {
    text: String(body.text || "").trim(),
    category: normalizeCategory(body.category),
    createdAt: body.createdAt ? new Date(body.createdAt).toISOString() : new Date().toISOString(),
  };
}

function normalizeCategory(value) {
  const allowed = ["Facultad", "Estudiemos", "Finanzas", "Proyectos", "Personal"];
  return allowed.includes(value) ? value : "";
}

function normalizeStatus(value) {
  const allowed = ["inbox", "procesado", "descartado"];
  return allowed.includes(value) ? value : "";
}

async function ensureLabel() {
  const labels = [
    { name: LABEL, color: "7057ff", description: "Entradas del Diario / Inbox de Ian OS" },
    { name: "estado:inbox", color: "0e8a16", description: "Entrada pendiente de procesar" },
    { name: "estado:procesado", color: "1d76db", description: "Entrada procesada" },
    { name: "estado:descartado", color: "d73a4a", description: "Entrada descartada" },
  ];

  await Promise.all(labels.map(async (label) => {
    const exists = await github(`/repos/${OWNER}/${REPO}/labels/${encodeURIComponent(label.name)}`, {
      method: "GET",
      okStatuses: [200, 404],
    });

    if (exists.status === 404) {
      await github(`/repos/${OWNER}/${REPO}/labels`, {
        method: "POST",
        body: label,
      });
    }
  }));
}

async function listEntries() {
  const issues = await github(`/repos/${OWNER}/${REPO}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`, {
    method: "GET",
  });

  return issues.data
    .filter((issue) => !issue.pull_request)
    .map(issueToEntry)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function createEntry(entry) {
  const title = entry.text.length > 72 ? `${entry.text.slice(0, 69)}...` : entry.text;
  const issue = await github(`/repos/${OWNER}/${REPO}/issues`, {
    method: "POST",
    body: {
      title: `[Inbox] ${title}`,
      body: [
        "<!-- ian-inbox:v1 -->",
        `Fecha: ${entry.createdAt}`,
        `Categoria: ${entry.category || "Sin categoria"}`,
        "Estado: inbox",
        "",
        "## Entrada",
        entry.text,
      ].join("\n"),
      labels: [LABEL, "estado:inbox"],
    },
  });

  return issue.data;
}

async function updateEntry(number, status) {
  const issue = await github(`/repos/${OWNER}/${REPO}/issues/${number}`, { method: "GET" });
  const labels = issue.data.labels
    .map((label) => label.name)
    .filter((name) => !name.startsWith("estado:"));

  const body = String(issue.data.body || "").replace(/Estado:\s*(inbox|procesado|descartado)/, `Estado: ${status}`);

  const updated = await github(`/repos/${OWNER}/${REPO}/issues/${number}`, {
    method: "PATCH",
    body: {
      body,
      labels: [...labels, `estado:${status}`],
    },
  });

  return updated.data;
}

function issueToEntry(issue) {
  const body = String(issue.body || "");
  const category = body.match(/Categoria:\s*(.+)/)?.[1]?.trim() || "";
  const status = body.match(/Estado:\s*(inbox|procesado|descartado)/)?.[1] || statusFromLabels(issue.labels);
  const text = body.split("## Entrada").slice(1).join("## Entrada").trim() || issue.title.replace(/^\[Inbox\]\s*/, "");
  const createdAt = body.match(/Fecha:\s*(.+)/)?.[1]?.trim() || issue.created_at;

  return {
    number: issue.number,
    text,
    category: category === "Sin categoria" ? "" : category,
    status,
    createdAt,
    url: issue.html_url,
  };
}

function statusFromLabels(labels) {
  const status = labels.map((label) => label.name).find((name) => name.startsWith("estado:"));
  return status ? status.replace("estado:", "") : "inbox";
}

async function github(path, options) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: options.method,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "ian-os-diario",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  const okStatuses = options.okStatuses || [200, 201];

  if (!okStatuses.includes(response.status)) {
    const message = data?.message || `GitHub API error ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  return { status: response.status, data };
}
