# 모여봐투게더

가입 없이 소셜 영상 링크, 사진, 영상을 공유하고 AI 친구 소담과 대화하는 웹 프로젝트입니다.

## 로컬 실행

```powershell
npm start
```

브라우저에서 엽니다.

```text
http://localhost:3000
```

## 환경변수

`.env.example`을 복사해서 `.env`를 만들고 필요한 값을 넣습니다.

```text
PORT=3000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=uploads
```

`OPENAI_API_KEY`가 없으면 소담이는 로컬 대화 엔진으로 답합니다. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 있으면 게시물/업로드 파일은 Supabase에 저장되고, 없으면 로컬 `data/`, `uploads/` 폴더를 사용합니다.

## Supabase 테이블

`posts` 테이블을 만듭니다.

```sql
create table if not exists public.posts (
  id uuid primary key,
  title text not null,
  category text not null,
  url text,
  author text not null,
  client_id text not null,
  file_url text,
  file_name text,
  file_type text,
  file_path text,
  created_at timestamptz not null default now()
);
```

댓글 기능을 위해 `comments` 테이블도 만듭니다.

```sql
create table if not exists public.comments (
  id uuid primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  author text not null,
  client_id text not null,
  content text not null,
  created_at timestamptz not null default now()
);
```

Storage bucket 이름은 기본값 `uploads`입니다. 업로드 미리보기를 공개로 보여주려면 bucket을 public으로 설정하세요.

## Render 배포

- Build Command: 비워두거나 `npm install`
- Start Command: `npm start`
- Environment Variables:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_BUCKET=uploads`
  - `OPENAI_API_KEY` 선택
  - `OPENAI_MODEL=gpt-5.2` 선택

`SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 비밀 키입니다. GitHub나 브라우저 코드에 넣지 마세요.
