---
name: orca-claude-accounts
description: Use when one project or repo must run Claude Code on a different Claude account (subscription) than other projects, especially inside the Orca app — 「이 프로젝트만 다른 계정」「계정 여러 개」「토큰 · 사용량 섞기 싫다」 — when Orca's bottom account switcher changes the account for every project, when a tab started on the wrong account, or when checking which account a Claude session is using.
---

# 프로젝트별 Claude 계정 (Orca)

## 핵심

Claude Code 의 계정은 **설정 폴더**(`CLAUDE_CONFIG_DIR`, 기본 `~/.claude`)로 나뉜다. 폴더마다 로그인 · 키체인 항목(`Claude Code-credentials-<sha256(폴더 경로) 앞 8자>`) · 사용량이 따로다.

Orca 는 에이전트를 띄울 때 **자기가 고른 계정 폴더를 직접 넣는다.** 그래서 Orca 의 + 버튼 · `orca agent launch` 에 먹히는 건 Orca 플러그인의 `agent.launch.before` 훅뿐이다. alias · direnv · claude-swap · `.claude/settings.json` 의 env 는 + 버튼에 안 먹는다(프로젝트 설정은 `CLAUDE_CONFIG_DIR` · `CLAUDE_CODE_OAUTH_TOKEN` 을 무시한다).

Orca 하단 계정 전환(`orca account select`)은 **맥 전체**에 걸린다. 프로젝트별 분리 수단이 아니다.

## 고르는 법

| 상황 | 쓸 것 |
|---|---|
| Orca 에서 + 버튼으로 띄움 | **Agent Accounts 플러그인** (아래) |
| Orca 없이 터미널만 | `alias claude-x='CLAUDE_CONFIG_DIR=<폴더> claude'` 또는 direnv |
| 사용량 대시보드 · 메뉴 막대가 필요 | claude-swap (`cswap map` + `cswap run`, 터미널 실행만) |

Claude Pin 플러그인도 같은 일을 하지만 사용량 표시를 위해 토큰을 Anthropic API 로 보낸다(켜야 동작). 토큰을 안 건드리는 Agent Accounts 를 먼저 고른다.

## 설치 · 설정 (Agent Accounts)

1. 쓸 계정이 Orca 에 있는지 본다: `orca account list --json` (이메일은 출력에서 가린다). 없으면 사용자가 Orca 설정에서 추가한다 — 로그인은 사람이 한다.
2. 기본 계정은 System default 로: `orca account select --agent claude --account system`. 플러그인 설명서가 권하는 상태이고, 지정 안 한 프로젝트는 `~/.claude` 로그인으로 뜬다. 사용자에게 먼저 알린다(맥 전체 설정).
3. 소스를 받아 읽는다(스크래치 폴더, 실행하지 않음). `worker/main.ts` 에 바깥 통신 · 토큰 읽기가 없는지, 훅이 명령 앞에 `CLAUDE_CONFIG_DIR=` 만 붙이는지 본다.
4. 읽은 버전 그대로 설치: `orca plugin install AnhVanGiang/orca-agent-accounts@v<버전>` → 나온 권한 목록이 읽은 코드와 맞으면 `--approve <지문>` 으로 다시 실행. 버전을 빼면 읽지 않은 코드가 들어온다.
5. 저장소 지정은 **패널에서만** 된다(카탈로그 · Git 설치는 CLI 요청 불가, `storage.json` 손수정 금지). 사용자에게: 오른쪽 사이드바 **Agent accounts** → **Claude → Whole repo** 에서 계정 선택.

## 확인 (보고 전에 반드시)

```sh
orca plugin logs anhvangiang.agent-accounts | tail
# "-> CLAUDE_CONFIG_DIR=…/claude-profiles/<id>/home" 줄 = 그 실행에 계정이 붙었다
```

- 지정한 저장소와 **지정 안 한 저장소**에 하나씩 띄워서(`orca agent launch --agent claude --worktree id:<id> --surface terminal --json`) 대조한다. 프로세스 환경은 `ps -Eww -o command= -p <claude pid>` 에서 `CLAUDE_CONFIG_DIR` 로 본다. 다 보면 띄운 탭을 `orca terminal close` 로 닫는다.
- 실제 계정: `CLAUDE_CONFIG_DIR=<폴더> claude auth status --json` (기본 로그인은 변수를 **빼고** 실행 — `~/.claude` 를 넣으면 `~/.claude/.claude.json` 을 찾다가 실패한다).
- 지금 세션: `echo $CLAUDE_CONFIG_DIR` 와 `claude auth status --json`.

## 걸리는 곳

| 경우 | 결과 · 대응 |
|---|---|
| 다시 연 탭, `--resume`, Orca 재시작 뒤 복원, 채팅 화면, 터미널에 친 `claude` | 훅을 안 거쳐 기본 계정으로 뜬다 → 패널 맨 아래 **Claude tabs here** 에서 **Move** (대화 유지, 진행 중 작업은 끊김) |
| "Move 가 안 보인다" | 그 카드는 패널 **맨 아래**(Codex 칸 다음)에 있다. 20초마다 갱신 |
| Move 뒤 `--effort` 등 실행 옵션 | 빠질 수 있다 → `/effort` 로 다시 |
| 같은 이메일이 목록에 둘 | Orca 에 같은 계정이 두 번 등록. 계정 폴더를 지우기 전에 `lsof +D` 로 쓰는 프로세스가 없는지 본다 |
| 계정을 나누면 메모리 · 기록이 끊길까 | Orca 계정 폴더의 `projects` · `skills` · `plugins` · `history.jsonl` 은 `~/.claude` 로의 링크다 → 이어진다 |

## 하지 말 것

- 하단 계정 전환을 프로젝트별 해법으로 제안하지 않는다.
- 로그인 · 계정 추가 · 키체인 항목 삭제를 대신 하지 않는다. 사용자에게 넘기거나 먼저 묻는다.
- 이메일 · 토큰 값을 출력하지 않는다(앞 몇 글자만).
