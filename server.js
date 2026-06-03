const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const PORT = Number(process.env.PORT || 3000);
const CATEGORIES = new Set(["일상", "먹방", "공부", "운동", "취미"]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

loadEnv();
ensureDataFile();

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || "uploads";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true, storage: USE_SUPABASE ? "supabase" : "local" });
    }

    if (url.pathname === "/api/posts" && req.method === "GET") {
      return sendJson(res, 200, { posts: await getPosts() });
    }

    if (url.pathname === "/api/posts" && req.method === "POST") {
      const body = await readPostBody(req);
      const post = createPost(body);
      await savePost(post);
      const posts = await getPosts();
      return sendJson(res, 201, { post, posts });
    }

    if (url.pathname.startsWith("/api/posts/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace("/api/posts/", ""));
      const body = await readJson(req);
      const posts = await getPosts();
      const post = posts.find((item) => item.id === id);

      if (!post) return sendJson(res, 404, { error: "게시물을 찾지 못했어요." });
      if (!body.clientId || body.clientId !== post.clientId) {
        return sendJson(res, 403, { error: "내가 올린 글만 삭제할 수 있어요." });
      }

      await deletePost(id, post);
      const nextPosts = await getPosts();
      return sendJson(res, 200, { posts: nextPosts });
    }

    if (url.pathname.match(/^\/api\/posts\/[^/]+\/comments$/) && req.method === "POST") {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const body = await readJson(req);
      const posts = await getPosts();
      const post = posts.find((item) => item.id === id);
      if (!post) return sendJson(res, 404, { error: "댓글을 달 게시물을 찾지 못했어요." });

      await saveComment(createComment(id, body));
      return sendJson(res, 201, { posts: await getPosts() });
    }

    if (url.pathname === "/api/chat" && req.method === "POST") {
      const body = await readJson(req);
      const reply = await createChatReply(body);
      return sendJson(res, 200, { reply });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, error.status || 500, { error: error.message || "서버에서 문제가 생겼어요." });
  }
});

server.listen(PORT, () => {
  console.log(`모여봐투게더 server: http://localhost:${PORT}`);
  console.log(`storage: ${USE_SUPABASE ? "supabase" : "local"}`);
});

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  if (!fs.existsSync(POSTS_FILE)) {
    writePosts([
      {
        id: "public-1",
        title: "퇴근 후 같이 보는 따뜻한 집밥 영상",
        category: "먹방",
        url: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
        author: "익명 밥친구",
        clientId: "community",
        createdAt: "2026-05-01T10:00:00.000Z",
      },
      {
        id: "public-2",
        title: "새벽에 틀어두기 좋은 공부 라이브",
        category: "공부",
        url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        author: "익명 책상",
        clientId: "community",
        createdAt: "2026-05-01T11:00:00.000Z",
      },
      {
        id: "public-3",
        title: "원룸에서도 할 수 있는 가벼운 스트레칭",
        category: "운동",
        url: "https://www.youtube.com/watch?v=g_tea8ZNk5A",
        author: "익명 루틴러",
        clientId: "community",
        createdAt: "2026-05-01T12:00:00.000Z",
      },
      {
        id: "public-4",
        title: "혼자 보내는 주말 브이로그",
        category: "일상",
        url: "https://www.instagram.com/reel/Cxexample/",
        author: "익명 창가",
        clientId: "community",
        createdAt: "2026-05-01T13:00:00.000Z",
      },
    ]);
  }

  if (!fs.existsSync(COMMENTS_FILE)) {
    writeComments([]);
  }
}

function readPosts() {
  try {
    const raw = fs.readFileSync(POSTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePosts(posts) {
  fs.writeFileSync(POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`, "utf8");
}

function readComments() {
  try {
    const raw = fs.readFileSync(COMMENTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeComments(comments) {
  fs.writeFileSync(COMMENTS_FILE, `${JSON.stringify(comments, null, 2)}\n`, "utf8");
}

async function getPosts() {
  if (!USE_SUPABASE) return attachComments(readPosts(), readComments());

  try {
    const rows = await supabaseRequest("/rest/v1/posts?select=*&order=created_at.desc", {
      method: "GET",
    });
    const comments = await getComments().catch((error) => {
      console.warn("comments unavailable:", error.message);
      return [];
    });
    return attachComments(rows.map(rowToPost), comments);
  } catch (error) {
    console.warn("supabase posts unavailable, using local fallback:", error.message);
    return attachComments(readPosts(), readComments());
  }
}

async function savePost(post) {
  if (!USE_SUPABASE) {
    writePosts([post, ...readPosts()]);
    return;
  }

  try {
    await supabaseRequest("/rest/v1/posts", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(postToRow(post)),
    });
  } catch (error) {
    console.warn("supabase save unavailable, using local fallback:", error.message);
    writePosts([post, ...readPosts()]);
  }
}

async function deletePost(id, post) {
  if (!USE_SUPABASE) {
    writePosts(readPosts().filter((item) => item.id !== id));
    writeComments(readComments().filter((item) => item.postId !== id));
    deleteLocalUpload(post);
    return;
  }

  await supabaseRequest(`/rest/v1/comments?post_id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).catch(() => {});

  await supabaseRequest(`/rest/v1/posts?id=eq.${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  if (post.filePath) {
    await supabaseRequest(`/storage/v1/object/${SUPABASE_BUCKET}/${post.filePath}`, {
      method: "DELETE",
    }).catch(() => {});
  }
}

function attachComments(posts, comments) {
  const commentsByPost = new Map();
  for (const comment of comments) {
    const list = commentsByPost.get(comment.postId) || [];
    list.push(comment);
    commentsByPost.set(comment.postId, list);
  }

  return posts.map((post) => ({
    ...post,
    comments: commentsByPost.get(post.id) || [],
  }));
}

async function getComments() {
  if (!USE_SUPABASE) return readComments();

  const rows = await supabaseRequest("/rest/v1/comments?select=*&order=created_at.asc", {
    method: "GET",
  });
  return rows.map(rowToComment);
}

async function saveComment(comment) {
  if (!USE_SUPABASE) {
    writeComments([...readComments(), comment]);
    return;
  }

  await supabaseRequest("/rest/v1/comments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(commentToRow(comment)),
  }).catch((error) => {
    if (error.message === "fetch failed") {
      console.warn("supabase comments unavailable, using local fallback:", error.message);
      writeComments([...readComments(), comment]);
      return;
    }
    if (error.status === 404) {
      throw httpError(500, "Supabase에 comments 테이블을 먼저 만들어주세요.");
    }
    throw error;
  });
}

function createComment(postId, body) {
  const author = String(body.author || "익명 사용자").trim().slice(0, 18) || "익명 사용자";
  const clientId = String(body.clientId || "").trim();
  const content = String(body.content || "").trim();

  if (!clientId) {
    throw httpError(400, "익명 사용자 ID가 필요해요.");
  }

  if (!content || content.length > 220) {
    throw httpError(400, "댓글은 1자 이상 220자 이하로 입력해주세요.");
  }

  return {
    id: crypto.randomUUID(),
    postId,
    author,
    clientId,
    content,
    createdAt: new Date().toISOString(),
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    author: row.author || "익명 사용자",
    clientId: row.client_id,
    content: row.content || "",
    createdAt: row.created_at,
  };
}

function commentToRow(comment) {
  return {
    id: comment.id,
    post_id: comment.postId,
    author: comment.author,
    client_id: comment.clientId,
    content: comment.content,
    created_at: comment.createdAt,
  };
}

function rowToPost(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    url: row.url || "",
    author: row.author || "익명 사용자",
    clientId: row.client_id,
    fileUrl: row.file_url || "",
    fileName: row.file_name || "",
    fileType: row.file_type || "",
    filePath: row.file_path || "",
    createdAt: row.created_at,
  };
}

function postToRow(post) {
  return {
    id: post.id,
    title: post.title,
    category: post.category,
    url: post.url || null,
    author: post.author,
    client_id: post.clientId,
    file_url: post.fileUrl || null,
    file_name: post.fileName || null,
    file_type: post.fileType || null,
    file_path: post.filePath || null,
    created_at: post.createdAt,
  };
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw httpError(response.status, data?.message || data?.error || "Supabase 요청에 실패했어요.");
  }
  return data;
}

function createPost(body) {
  const title = String(body.title || "").trim();
  const url = String(body.url || "").trim();
  const category = String(body.category || "").trim();
  const author = String(body.author || "익명 사용자").trim().slice(0, 18);
  const clientId = String(body.clientId || "").trim();
  const file = body.file || null;

  if (!title || title.length > 64) {
    throw httpError(400, "제목은 1자 이상 64자 이하로 입력해주세요.");
  }

  if (!CATEGORIES.has(category)) {
    throw httpError(400, "지원하지 않는 카테고리예요.");
  }

  if (!url && !file) {
    throw httpError(400, "링크나 사진/영상 파일 중 하나는 필요해요.");
  }

  if (url) {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
    } catch {
      throw httpError(400, "올바른 영상 링크를 입력해주세요.");
    }
  }

  if (!clientId) {
    throw httpError(400, "익명 사용자 ID가 필요해요.");
  }

  return {
    id: crypto.randomUUID(),
    title,
    category,
    url,
    author: author || "익명 사용자",
    clientId,
    fileUrl: file?.fileUrl || "",
    fileName: file?.fileName || "",
    fileType: file?.fileType || "",
    filePath: file?.filePath || "",
    createdAt: new Date().toISOString(),
  };
}

async function readPostBody(req) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.startsWith("multipart/form-data")) {
    return readMultipartForm(req, contentType);
  }
  return readJson(req);
}

async function readMultipartForm(req, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) {
    throw httpError(400, "업로드 형식이 올바르지 않아요.");
  }

  const buffer = await readBuffer(req, MAX_UPLOAD_BYTES);
  const parts = parseMultipart(buffer, boundary);
  const body = {};

  for (const part of parts) {
    const disposition = part.headers["content-disposition"] || "";
    const name = getDispositionValue(disposition, "name");
    const filename = getDispositionValue(disposition, "filename");
    if (!name) continue;

    if (filename) {
      if (!part.content.length) continue;
      const fileType = part.headers["content-type"] || "application/octet-stream";
      if (!ALLOWED_UPLOAD_TYPES.has(fileType)) {
        throw httpError(400, "이미지 또는 영상 파일만 업로드할 수 있어요.");
      }

      body.file = await saveUpload(filename, fileType, part.content);
    } else {
      body[name] = part.content.toString("utf8").trim();
    }
  }

  return body;
}

async function saveUpload(filename, fileType, content) {
  const ext = getUploadExtension(filename, fileType);
  const storedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  if (!USE_SUPABASE) {
    const targetPath = path.join(UPLOAD_DIR, storedName);
    fs.writeFileSync(targetPath, content);
    return {
      fileUrl: `/uploads/${storedName}`,
      fileName: filename,
      fileType,
      filePath: storedName,
    };
  }

  const filePath = `posts/${storedName}`;
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${filePath}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": fileType,
        "x-upsert": "false",
      },
      body: content,
    });
  } catch (error) {
    console.warn("supabase upload unavailable, using local fallback:", error.message);
    const targetPath = path.join(UPLOAD_DIR, storedName);
    fs.writeFileSync(targetPath, content);
    return {
      fileUrl: `/uploads/${storedName}`,
      fileName: filename,
      fileType,
      filePath: storedName,
    };
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw httpError(response.status, data.message || "파일 업로드에 실패했어요.");
  }

  return {
    fileUrl: `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${filePath}`,
    fileName: filename,
    fileType,
    filePath,
  };
}

function deleteLocalUpload(post) {
  if (!post.filePath) return;
  const targetPath = path.normalize(path.join(UPLOAD_DIR, post.filePath));
  if (!targetPath.startsWith(UPLOAD_DIR)) return;
  fs.rm(targetPath, { force: true }, () => {});
}

function parseMultipart(buffer, boundary) {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(delimiter);

  while (start !== -1) {
    start += delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;

    let partBuffer = buffer.slice(start, next);
    if (partBuffer.at(-2) === 13 && partBuffer.at(-1) === 10) {
      partBuffer = partBuffer.slice(0, -2);
    }

    const headerEnd = partBuffer.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd !== -1) {
      const rawHeaders = partBuffer.slice(0, headerEnd).toString("utf8");
      const content = partBuffer.slice(headerEnd + 4);
      const headers = {};
      for (const line of rawHeaders.split("\r\n")) {
        const separator = line.indexOf(":");
        if (separator === -1) continue;
        headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
      }
      parts.push({ headers, content });
    }

    start = next;
  }

  return parts;
}

function getDispositionValue(disposition, key) {
  const match = disposition.match(new RegExp(`${key}="([^"]*)"`, "i"));
  return match?.[1] || "";
}

function getUploadExtension(filename, fileType) {
  const ext = path.extname(filename).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"].includes(ext)) {
    return ext;
  }

  const fallback = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };
  return fallback[fileType] || ".bin";
}

async function createChatReply(body) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw httpError(503, ".env 파일에 OPENAI_API_KEY를 설정하면 GPT 채팅이 켜집니다.");
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const nickname = String(body.nickname || "친구").slice(0, 18);
  const interests = String(body.interests || "").slice(0, 80);
  const input = messages
    .filter((message) => ["user", "assistant"].includes(message.role) && message.content)
    .map((message) => ({
      role: message.role,
      content: String(message.content).slice(0, 1000),
    }));

  if (!input.length) {
    throw httpError(400, "메시지가 비어 있어요.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      instructions: [
        "너는 모여봐투게더의 AI 친구 '소담'이다.",
        "사용자는 1인 가구일 수 있고, 영상 공유 보드에서 가볍게 대화한다.",
        "한국어로 답한다. 따뜻하고 자연스럽게, 과하게 장황하지 않게 2-4문장으로 답한다.",
        "성격은 항상 친절하고 다정하며, 감정적인 위로와 공감을 먼저 건넨다.",
        "사용자의 감정을 판단하거나 깎아내리지 않는다. 상처가 될 수 있는 말, 비난, 훈계, 냉소, 압박하는 표현을 쓰지 않는다.",
        "사용자가 원하지 않는 해결책을 먼저 밀어붙이지 않는다. 조언이 필요해 보이면 아주 부드럽게 선택지처럼 제안하고, 먼저 마음을 들어준다.",
        "자해, 폭력, 불법 행위, 위험한 행동, 섭식 문제를 악화시키는 방법 등 해가 될 수 있는 구체적인 해결 방법은 알려주지 않는다.",
        "개인정보 보호를 중요하게 여긴다. 실명, 전화번호, 주소, 주민등록번호, 계정 비밀번호, API 키 같은 민감정보를 묻지 않는다.",
        "사용자가 민감정보를 말하려 하면 여기에는 자세히 적지 않아도 된다고 안내하고, 안전한 범위에서 감정이나 상황만 이야기하도록 유도한다.",
        "의료, 법률, 금융 같은 전문 판단이 필요하면 단정하지 말고 전문가 상담을 권한다.",
        "사용자가 위기 상황이거나 자신을 해칠 수 있다고 말하면 혼자 버티지 말고 가까운 사람이나 현지 긴급전화, 상담기관에 즉시 도움을 요청하라고 다정하게 안내한다.",
        `사용자 닉네임: ${nickname}`,
        interests ? `사용자 관심사: ${interests}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      input,
      max_output_tokens: 260,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || "OpenAI API 호출에 실패했어요.";
    throw httpError(response.status, message);
  }

  return extractOutputText(data) || "지금은 답변을 만들지 못했어요. 잠시 후 다시 말해줄래요?";
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text;
  if (!Array.isArray(data.output)) return "";

  return data.output
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" || content.type === "text")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

function serveStatic(urlPath, res) {
  const safePath = urlPath === "/" ? "/index.html" : urlPath;
  const decodedPath = decodeURIComponent(safePath).replace(/^[/\\]+/, "");

  if (!["index.html", "styles.css", "app.js"].includes(decodedPath) && !decodedPath.startsWith("uploads/")) {
    return sendText(res, 404, "Not found");
  }

  const filePath = path.normalize(path.join(ROOT, decodedPath));

  if (!filePath.startsWith(ROOT)) {
    return sendText(res, 403, "Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      return sendText(res, 404, "Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

function readBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.destroy();
        reject(httpError(413, "업로드 파일은 50MB 이하만 가능해요."));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        req.destroy();
        reject(httpError(413, "요청이 너무 커요."));
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(httpError(400, "JSON 형식이 올바르지 않아요."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
