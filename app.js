const STORAGE_KEY = "moyobwa-together-state-v2";
const API_BASE = window.location.protocol === "file:" ? "" : "";

const defaultState = {
  clientId: "",
  profile: {
    nickname: "혼자사는친구",
    interests: "먹방, 공부, 산책",
  },
  interactions: {},
};

const fallbackPosts = [
  {
    id: "public-1",
    title: "퇴근 후 같이 보는 따뜻한 집밥 영상",
    category: "먹방",
    url: "https://www.youtube.com/watch?v=ysz5S6PUM-U",
    author: "익명 밥친구",
    clientId: "community",
  },
  {
    id: "public-2",
    title: "새벽에 틀어두기 좋은 공부 라이브",
    category: "공부",
    url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    author: "익명 책상",
    clientId: "community",
  },
  {
    id: "public-3",
    title: "원룸에서도 할 수 있는 가벼운 스트레칭",
    category: "운동",
    url: "https://www.youtube.com/watch?v=g_tea8ZNk5A",
    author: "익명 루틴러",
    clientId: "community",
  },
  {
    id: "public-4",
    title: "혼자 보내는 주말 브이로그",
    category: "일상",
    url: "https://www.instagram.com/reel/Cxexample/",
    author: "익명 창가",
    clientId: "community",
  },
];

const board = document.querySelector("#board");
const postForm = document.querySelector("#postForm");
const linkInput = document.querySelector("#linkInput");
const fileInput = document.querySelector("#fileInput");
const titleInput = document.querySelector("#titleInput");
const categoryInput = document.querySelector("#categoryInput");
const filterButtons = document.querySelectorAll(".filter-chip");
const railButtons = document.querySelectorAll(".rail-button");
const viewEyebrow = document.querySelector("#viewEyebrow");
const viewTitle = document.querySelector("#viewTitle");
const profileView = document.querySelector("#profileView");
const profileName = document.querySelector("#profileName");
const profileInterests = document.querySelector("#profileInterests");
const profileAvatar = document.querySelector("#profileAvatar");
const postCount = document.querySelector("#postCount");
const bookmarkCount = document.querySelector("#bookmarkCount");
const chatPanel = document.querySelector("#chatPanel");
const openChatButton = document.querySelector("#openChatButton");
const closeChatButton = document.querySelector("#closeChatButton");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const chatMessages = document.querySelector("#chatMessages");
const accountModal = document.querySelector("#accountModal");
const storageButton = document.querySelector("#storageButton");
const profileButton = document.querySelector("#profileButton");
const editProfileButton = document.querySelector("#editProfileButton");
const saveProfileButton = document.querySelector("#saveProfileButton");
const nicknameInput = document.querySelector("#nicknameInput");
const interestInput = document.querySelector("#interestInput");

let currentCategory = "전체";
let currentView = "board";
let state = loadState();
let posts = [];
let lastBotReply = "";
let chatHistory = [];
let localChatMemory = {
  lastIntent: "",
  lastMood: "",
  turnCount: 0,
  userNameMentioned: false,
};

function loadState() {
  try {
    const savedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const nextState = {
      ...defaultState,
      ...savedState,
      profile: { ...defaultState.profile, ...savedState?.profile },
      interactions: savedState?.interactions || {},
    };
    return ensureClientId(nextState);
  } catch {
    return ensureClientId({ ...defaultState, profile: { ...defaultState.profile }, interactions: {} });
  }
}

function ensureClientId(nextState) {
  if (!nextState.clientId) {
    nextState.clientId = `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
  return nextState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "요청을 처리하지 못했어요.");
  }
  return data;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[char];
  });
}

function getPlatform(url) {
  if (!url) return "업로드";
  try {
    const host = new URL(url).hostname.replace("www.", "");
    if (host.includes("youtu")) return "YouTube";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("tiktok")) return "TikTok";
    return host;
  } catch {
    return "SNS";
  }
}

function getYouTubeId(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) return parsed.pathname.slice(1);
    if (parsed.hostname.includes("youtube")) return parsed.searchParams.get("v");
  } catch {
    return null;
  }
  return null;
}

function getPreview(post) {
  if (post.fileUrl && post.fileType?.startsWith("image/")) {
    return `
      <a class="post-preview-link" href="${escapeHtml(post.fileUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(post.title)} 이미지 열기">
        <img src="${escapeHtml(post.fileUrl)}" alt="${escapeHtml(post.title)} 업로드 이미지" loading="lazy" />
      </a>
    `;
  }

  if (post.fileUrl && post.fileType?.startsWith("video/")) {
    const isQuickTime = post.fileType === "video/quicktime" || post.fileName?.toLowerCase().endsWith(".mov");
    return `
      <div class="video-frame ${isQuickTime ? "video-error" : ""}">
        <video class="post-video" controls playsinline preload="metadata">
          <source src="${escapeHtml(post.fileUrl)}"${isQuickTime ? "" : ` type="${escapeHtml(post.fileType)}"`} />
        </video>
        <div class="video-fallback-note">
          ${isQuickTime ? "MOV 파일은 일부 브라우저에서 바로 재생되지 않을 수 있어요." : "영상이 재생되지 않으면 새 탭에서 열어보세요."}
          <a href="${escapeHtml(post.fileUrl)}" target="_blank" rel="noopener noreferrer">파일 열기</a>
        </div>
      </div>
    `;
  }

  const youtubeId = getYouTubeId(post.url);
  const preview = youtubeId
    ? `<img src="https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg" alt="${escapeHtml(post.title)} 썸네일" loading="lazy" />`
    : `<div class="preview-fallback">${getPlatform(post.url)}<br />링크 미리보기</div>`;

  return `
    <a class="post-preview-link" href="${escapeHtml(post.url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(post.title)} 영상 열기">
      ${preview}
    </a>
  `;
}

function getAllPosts() {
  return posts.map((post) => ({
    ...post,
    owner: post.clientId === state.clientId ? "me" : "community",
    liked: Boolean(state.interactions[post.id]?.liked),
    bookmarked: Boolean(state.interactions[post.id]?.bookmarked),
  }));
}

function getVisiblePosts() {
  const allPosts = getAllPosts();
  const viewPosts = currentView === "bookmarks" ? allPosts.filter((post) => post.bookmarked) : allPosts;
  return currentCategory === "전체" ? viewPosts : viewPosts.filter((post) => post.category === currentCategory);
}

function renderEmptyState(heading, copy) {
  board.classList.add("is-empty");
  board.innerHTML = `
    <div class="empty-state">
      <h2>${heading}</h2>
      <p>${copy}</p>
    </div>
  `;
}

function renderPosts() {
  const visiblePosts = getVisiblePosts();
  board.classList.remove("is-empty");

  if (currentView === "profile") {
    board.innerHTML = "";
    return;
  }

  if (!visiblePosts.length) {
    const isBookmarkView = currentView === "bookmarks";
    renderEmptyState(
      isBookmarkView ? "아직 북마크한 영상이 없어요" : "아직 올라온 영상이 없어요",
      isBookmarkView
        ? "보드에서 마음에 드는 카드를 북마크하면 이곳에 모입니다."
        : "위 입력창에 SNS 영상 링크를 붙여 넣으면 익명 공유 보드에 올라갑니다.",
    );
    return;
  }

  board.innerHTML = visiblePosts
    .map(
      (post) => `
        <article class="post-card">
          ${getPreview(post)}
          <div class="post-body">
            <div class="post-meta">
              <span class="tag">${escapeHtml(post.category)}</span>
              <span class="platform">${getPlatform(post.url)}</span>
            </div>
            <h3 class="post-title">${escapeHtml(post.title)}</h3>
            <p class="post-author">${escapeHtml(post.author || "익명 사용자")}</p>
            <p class="post-link">${escapeHtml(post.url || post.fileName || "업로드 파일")}</p>
            <div class="post-actions">
              <button class="action-button ${post.liked ? "active" : ""}" data-action="like" data-id="${post.id}" type="button">좋아요 ${post.liked ? "완료" : ""}</button>
              <button class="action-button ${post.bookmarked ? "active" : ""}" data-action="bookmark" data-id="${post.id}" type="button">북마크 ${post.bookmarked ? "완료" : ""}</button>
              ${
                post.owner === "me"
                  ? `<button class="action-button danger" data-action="delete" data-id="${post.id}" type="button">삭제</button>`
                  : `<button class="action-button muted" type="button" disabled>공개글</button>`
              }
            </div>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderProfile() {
  const nickname = state.profile.nickname || defaultState.profile.nickname;
  const interests = state.profile.interests || "관심사를 설정해보세요.";
  profileName.textContent = nickname;
  profileInterests.textContent = interests;
  profileAvatar.textContent = nickname.slice(0, 1);
  profileButton.textContent = nickname;
  nicknameInput.value = nickname;
  interestInput.value = state.profile.interests || "";
  postCount.textContent = posts.filter((post) => post.clientId === state.clientId).length;
  bookmarkCount.textContent = getAllPosts().filter((post) => post.bookmarked).length;
}

function setView(view) {
  currentView = view;
  railButtons.forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  profileView.hidden = view !== "profile";
  postForm.closest(".composer").hidden = view === "profile";
  document.querySelector(".filters").hidden = view === "profile";

  if (view === "bookmarks") {
    viewEyebrow.textContent = "모여봐투게더 북마크";
    viewTitle.textContent = "자신의 일상을 간단히 공유해보세요!";
  } else if (view === "profile") {
    viewEyebrow.textContent = "모여봐투게더 프로필";
    viewTitle.textContent = "자신의 일상을 간단히 공유해보세요!";
  } else {
    viewEyebrow.textContent = "모여봐투게더";
    viewTitle.textContent = "자신의 일상을 간단히 공유해보세요!";
  }

  renderProfile();
  renderPosts();
}

function addMessage(text, sender) {
  const message = document.createElement("div");
  message.className = `message ${sender}`;
  message.textContent = text;
  chatMessages.appendChild(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatHistory.push({ role: sender === "user" ? "user" : "assistant", content: text });
  chatHistory = chatHistory.slice(-10);
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function scoreKeywords(text, keywords) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function detectLocalContext(text) {
  const normalized = text.trim().toLowerCase();
  const scores = {
    lonely: scoreKeywords(normalized, ["외로", "혼자", "쓸쓸", "허전", "심심", "고독"]),
    tired: scoreKeywords(normalized, ["피곤", "지쳤", "힘들", "무기력", "잠", "쉬고", "번아웃"]),
    study: scoreKeywords(normalized, ["공부", "집중", "과제", "시험", "일", "마감", "수업"]),
    food: scoreKeywords(normalized, ["밥", "먹", "배고", "요리", "메뉴", "혼밥", "간식"]),
    content: scoreKeywords(normalized, ["영상", "유튜브", "틱톡", "인스타", "릴스", "보드", "올렸", "링크"]),
    happy: scoreKeywords(normalized, ["좋아", "행복", "기뻐", "고마", "괜찮", "재밌", "웃"]),
    anxious: scoreKeywords(normalized, ["불안", "걱정", "무서", "떨려", "긴장", "답답"]),
    greeting: scoreKeywords(normalized, ["안녕", "하이", "hello", "ㅎㅇ", "반가"]),
  };
  const intent = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[1] ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] : "general";
  const question = normalized.includes("?") || includesAny(normalized, ["뭐", "어떻게", "왜", "추천", "할까", "좋을까"]);
  return { normalized, intent, question };
}

function getRecentUserMessages() {
  return chatHistory
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .slice(-3);
}

function pickReply(replies) {
  const candidates = replies.filter((reply) => reply !== lastBotReply);
  const pool = candidates.length ? candidates : replies;
  const reply = pool[Math.floor(Math.random() * pool.length)];
  lastBotReply = reply;
  return reply;
}

function makeReply(parts) {
  return parts.filter(Boolean).join(" ");
}

function getBoardHint(intent) {
  const categoryHints = {
    lonely: "위로가 됐던 일상 영상이나 조용한 브이로그를 보드에 남겨도 좋아요.",
    tired: "쉬어가는 영상 하나를 북마크해두면 나중에 다시 기대기 좋을 것 같아요.",
    study: "공부 영상이나 집중 플레이리스트를 올리면 비슷한 하루를 보내는 사람에게도 도움이 될 수 있어요.",
    food: "먹방이나 간단한 집밥 영상은 같이 밥 먹는 느낌을 만들기 좋아요.",
    happy: "기분 좋아진 순간을 영상으로 남겨두면 작은 일기처럼 쌓일 거예요.",
  };
  return categoryHints[intent] || "오늘 마음에 남은 영상이 있다면 보드에 가볍게 올려봐도 좋아요.";
}

function getLocalBotReply(text) {
  const context = detectLocalContext(text);
  const normalized = context.normalized;
  const nickname = state.profile.nickname || "친구";
  const recentMessages = getRecentUserMessages();
  const isFollowUp = localChatMemory.lastIntent && localChatMemory.lastIntent === context.intent;
  localChatMemory.turnCount += 1;
  localChatMemory.lastIntent = context.intent;

  if (context.intent === "greeting") {
    return pickReply([
      `${nickname}님, 안녕하세요. 소담이에요. 오늘은 어떤 하루였는지 편하게 들려줘요.`,
      "안녕해줘서 고마워요. 저는 여기 있어요. 오늘 마음은 조금 가벼운 편이에요, 아니면 무거운 편이에요?",
      `반가워요, ${nickname}님. 오늘 같이 보고 싶은 영상이나 그냥 털어놓고 싶은 이야기가 있나요?`,
    ]);
  }

  if (normalized.length < 3) {
    return pickReply([
      "조금만 더 말해줘도 좋아요. 짧은 단어 하나여도 제가 이어서 들어볼게요.",
      "음, 지금 마음이 말로 잘 안 잡히는 순간일 수도 있겠네요. 어떤 분위기인지부터 말해볼까요?",
      `${nickname}님, 한 문장으로만 말해도 괜찮아요. 제가 천천히 따라갈게요.`,
    ]);
  }

  if (context.intent === "lonely") {
    return pickReply([
      makeReply([
        "그 마음 알 것 같아요.",
        "혼자 있는 시간이 길면 방은 조용한데 마음은 더 시끄러워질 때가 있죠.",
        isFollowUp ? "아직 그 허전함이 이어지고 있나 봐요." : "제가 옆자리 친구처럼 들어볼게요.",
        "지금은 해결보다 같이 있어주는 말이 먼저 필요해 보여요.",
        getBoardHint("lonely"),
      ]),
      "오늘은 혼자라는 느낌이 좀 크게 온 날이었나 봐요. 그 마음을 이상하게 보지 않아도 괜찮아요. 무슨 순간에 제일 허전했는지, 아주 짧게만 말해줘도 돼요.",
      "허전함을 말로 꺼낸 것만으로도 조금은 정리가 시작된 거예요. 자세한 개인정보는 말하지 않아도 괜찮고, 그냥 오늘의 분위기만 들려줘도 좋아요.",
    ]);
  }

  if (context.intent === "tired") {
    return pickReply([
      "많이 지친 상태로 여기까지 온 것 같아요. 오늘은 더 잘해야 한다는 말보다, 이미 버틴 만큼 충분히 애썼다는 말을 먼저 해주고 싶어요.",
      "피곤할 때는 작은 일도 크게 느껴지죠. 지금은 무언가를 해결하기보다 잠깐 숨을 고르는 쪽이 더 다정한 선택일 수 있어요.",
      `${nickname}님, 오늘 에너지가 많이 닳은 날 같아요. 할 일을 정리하기 전에 몸이 원하는 게 잠깐의 휴식인지, 따뜻한 음식인지부터 살펴봐도 좋아요. ${getBoardHint("tired")}`,
    ]);
  }

  if (context.intent === "study") {
    return pickReply([
      "공부나 일이 버겁게 느껴지는 날이군요. 무리하게 몰아붙이기보다, 지금 할 수 있는 가장 작은 한 조각만 같이 골라봐요.",
      "집중이 안 되는 건 의지가 약해서가 아니라 머리가 이미 많이 바쁠 때도 그래요. 오늘은 10분만 시작해도 충분히 의미 있어요.",
      context.question
        ? "추천을 원한다면, 저는 먼저 책상 정리 1분, 할 일 하나 적기, 10분 타이머 순서가 좋다고 생각해요. 부담이 덜한 것부터 고르면 돼요."
        : `지금 해야 할 일을 한 줄로만 말해주면, 제가 부담 덜한 순서로 같이 나눠볼게요. ${getBoardHint("study")}`,
    ]);
  }

  if (context.intent === "food") {
    return pickReply([
      "밥 이야기는 중요하죠. 오늘 먹은 게 든든했는지부터 궁금해요. 대충 먹었어도 챙겨 먹은 건 꽤 잘한 일이에요.",
      "혼밥은 가끔 조용하지만, 내 속도대로 먹을 수 있는 작은 자유도 있더라고요. 오늘 메뉴는 성공 쪽이었나요?",
      context.question
        ? "메뉴를 고르는 중이면 따뜻하고 간단한 쪽을 추천하고 싶어요. 국물, 덮밥, 계란 들어간 메뉴처럼 몸이 편해지는 걸로요."
        : `먹는 이야기는 괜히 마음까지 조금 풀리게 해요. ${getBoardHint("food")}`,
    ]);
  }

  if (context.intent === "content") {
    return pickReply([
      "그 영상은 어떤 기분으로 공유하고 싶어졌어요? 웃겨서, 위로돼서, 아니면 누군가랑 같이 보고 싶어서요?",
      "좋아요. 보드에 올린 영상들은 나중에 보면 그날의 기분 기록처럼 남더라고요. 제목도 지금 기분이 살짝 보이게 지어보면 좋아요.",
      "링크 하나가 그냥 영상이 아니라 오늘의 흔적이 될 수 있죠. 일상, 먹방, 공부, 운동, 취미 중에 어디에 제일 가까워 보여요?",
    ]);
  }

  if (context.intent === "happy") {
    return pickReply([
      "그 말 들으니 저도 좋아요. 그런 괜찮은 순간은 작아 보여도 하루를 버티게 해주는 힘이 있더라고요.",
      "좋은 쪽의 마음이 있다니 반가워요. 그 기분을 만든 장면을 보드에 남겨두면 나중에 다시 봐도 따뜻할 것 같아요.",
      `${nickname}님에게 오늘 괜찮은 순간이 있었다는 게 참 좋아요. 그 분위기를 조금 더 오래 붙잡아도 괜찮아요. ${getBoardHint("happy")}`,
    ]);
  }

  if (context.intent === "anxious") {
    return pickReply([
      "불안한 마음이 올라오면 작은 일도 크게 흔들리게 느껴지죠. 지금 당장 다 해결하지 않아도 괜찮아요. 우선 숨을 조금 천천히 쉬어볼까요?",
      "걱정이 많아진 상태라면 머릿속이 계속 앞질러 달리고 있을 수 있어요. 여기서는 자세한 개인정보 없이, 어떤 느낌인지 정도만 말해도 충분해요.",
      "그 불안이 가볍지 않게 느껴져요. 혼자 감당하기 너무 크다면 가까운 사람이나 학교 상담실 같은 안전한 도움을 같이 떠올려봐도 좋아요.",
    ]);
  }

  return pickReply([
    makeReply([
      "말해줘서 고마워요.",
      recentMessages.length > 1 ? "방금 전 이야기랑 이어서 들어보면, 오늘 마음에 남은 게 꽤 있는 것 같아요." : "제가 보기엔 지금 이야기는 조금 더 풀어봐도 좋을 것 같아요.",
      "제일 먼저 떠오르는 장면은 뭐예요?",
    ]),
    `${nickname}님 말 속에 오늘의 분위기가 조금 묻어나는 것 같아요. 정확히 정리하지 않아도 괜찮으니, 마음에 걸린 부분부터 천천히 말해줘요.`,
    "그럴 수 있죠. 바로 해결하지 않아도 괜찮아요. 우선 지금 감정에 가까운 단어 하나만 골라볼까요?",
    "소담은 여기 있어요. 이야기의 순서가 뒤죽박죽이어도 괜찮으니 생각나는 대로 말해줘요.",
  ]);
}

async function loadPosts() {
  try {
    const data = await apiRequest("/api/posts");
    posts = data.posts || [];
  } catch {
    posts = fallbackPosts;
  }

  renderProfile();
  renderPosts();
}

postForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!linkInput.value.trim() && !fileInput.files[0]) {
    addMessage("링크나 사진/영상 파일 중 하나는 넣어야 게시할 수 있어요.", "bot");
    return;
  }

  const formData = new FormData();
  formData.append("title", titleInput.value.trim());
  formData.append("category", categoryInput.value);
  formData.append("url", linkInput.value.trim());
  formData.append("author", state.profile.nickname);
  formData.append("clientId", state.clientId);
  if (fileInput.files[0]) {
    formData.append("media", fileInput.files[0]);
  }

  try {
    const response = await fetch("/api/posts", {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "게시물을 저장하지 못했어요.");
    posts = data.posts || posts;
  } catch (error) {
    addMessage(`게시물 저장 중 문제가 생겼어요: ${error.message}`, "bot");
    return;
  }

  postForm.reset();
  categoryInput.value = "일상";
  currentCategory = "전체";
  setView("board");
  filterButtons.forEach((button) => button.classList.toggle("active", button.dataset.category === "전체"));
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    currentCategory = button.dataset.category;
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    renderPosts();
  });
});

board.addEventListener("click", async (event) => {
  const button = event.target.closest(".action-button");
  if (!button || button.disabled) return;

  const post = posts.find((item) => item.id === button.dataset.id);
  if (!post) return;

  if (button.dataset.action === "delete") {
    if (post.clientId !== state.clientId) return;
    try {
      const data = await apiRequest(`/api/posts/${encodeURIComponent(post.id)}`, {
        method: "DELETE",
        body: JSON.stringify({ clientId: state.clientId }),
      });
      posts = data.posts || posts.filter((item) => item.id !== post.id);
    } catch (error) {
      addMessage(`삭제 중 문제가 생겼어요: ${error.message}`, "bot");
      return;
    }
  } else {
    const interaction = state.interactions[post.id] || {};
    const key = button.dataset.action === "like" ? "liked" : "bookmarked";
    state.interactions[post.id] = {
      ...interaction,
      [key]: !interaction[key],
    };
    saveState();
  }

  renderProfile();
  renderPosts();
});

board.addEventListener(
  "error",
  (event) => {
    const video = event.target.closest?.(".post-video");
    if (!video) return;
    video.closest(".video-frame")?.classList.add("video-error");
  },
  true,
);

railButtons.forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

openChatButton.addEventListener("click", () => {
  chatPanel.classList.add("open");
});

closeChatButton.addEventListener("click", () => {
  chatPanel.classList.remove("open");
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  addMessage(text, "user");
  chatInput.value = "";

  try {
    const data = await apiRequest("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        nickname: state.profile.nickname,
        interests: state.profile.interests,
        messages: chatHistory.slice(-8),
      }),
    });
    addMessage(data.reply, "bot");
  } catch (error) {
    const fallback = getLocalBotReply(text);
    console.warn("GPT chat fallback:", error);
    addMessage(fallback, "bot");
  }
});

[profileButton, editProfileButton, storageButton].forEach((button) => {
  button.addEventListener("click", () => accountModal.showModal());
});

saveProfileButton.addEventListener("click", () => {
  state.profile.nickname = nicknameInput.value.trim() || defaultState.profile.nickname;
  state.profile.interests = interestInput.value.trim();
  saveState();
  renderProfile();
});

saveState();
renderProfile();
setView("board");
loadPosts();
