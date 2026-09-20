---
name: codex
description: Use when delegating a coding or image task to the local codex CLI, or when a codex run misbehaves — tool calls dying with "failed to decode code-mode IPC frame" or "불가: 터미널 도구", network failures inside the sandbox (fetch failed, ENOTFOUND, npm ERR! network), 401/token_revoked, a stall after "Reading additional input from stdin", a model rejected as not supported, or a success report you have not verified.
---

# codex 위임

로컬 `codex` CLI 에 구현·이미지 생성을 위임한다. 메인은 조정·판단·검증만 한다.

**핵심 원칙: codex 의 자기보고를 믿지 말고 산출물을 열어 확인한다.** (아래 「거짓 보고」)

## 이 머신의 사실 (2026-09-09 실측)

| | |
|---|---|
| 바이너리 | `~/.local/bin/codex` 는 앱 내장본 `/Applications/ChatGPT.app/Contents/Resources/codex` 의 **심링크 — 같은 파일**이다. 그냥 `codex` 를 쓴다. 풀패스로 우회할 이유는 없다 |
| 버전 | `codex-cli 0.153.4` |
| 인증 | **ChatGPT 구독 계정** (`codex login status` → `Logged in using ChatGPT`). `OPENAI_API_KEY` 없음 |
| **모델** | **`-m` 을 붙이지 않는다.** `~/.codex/config.toml` 의 `model` 이 정하고, 사용자가 바꾸면 그대로 따라간다. 스킬이 특정 모델을 박아 두면 사용자 설정을 덮어써 버린다. 지금 무엇으로 도는지는 `grep '^model' ~/.codex/config.toml` 또는 실행 배너의 `model:` 줄로 본다. 특정 모델이 꼭 필요한 작업에서만 `-m` 을 붙인다 |
| **앱에서 바꾼 모델은 CLI 에 안 온다** | ChatGPT 앱 UI 의 모델 선택은 앱 대화용이고 CLI 와 공유되지 않는다(2026-09-09 실측: 앱에서 바꾼 뒤에도 `~/.codex/config.toml`·실행 배너·대화형 세션 모두 이전 값 그대로였다). CLI 모델을 바꾸려면 `~/.codex/config.toml` 의 `model` 을 고친다. 앱은 CODEX_HOME 자체가 다르다 — `~/Library/Application Support/orca/codex-runtime-home/home/` |
| OS | macOS. bwrap 없음 — EC2 용 `--sandbox danger-full-access` 강제 지침은 해당 없음 |

## 호출 (stdin 을 반드시 명시)

codex 는 stdin 이 열려 있으면 `Reading additional input from stdin...` 을 띄우고 EOF 를 기다린다. 대화형 터미널에서는 그대로 멈춘다. **모든 호출에 파이프 또는 `< /dev/null`.**

```bash
mkdir -p /tmp/codex-logs
cat /tmp/codex_prompt_${TAG}.md | codex exec \
  -C "$PWD" --sandbox workspace-write --skip-git-repo-check \
  -o /tmp/codex-logs/${TAG}_last.md > /tmp/codex-logs/${TAG}.log 2>&1

codex exec --skip-git-repo-check "{짧은 지시}" < /dev/null   # 인라인
codex exec resume --last "{후속}" < /dev/null                # 이어가기
```

**Bash 도구로는 `run_in_background: true`** — `nohup ... &` 는 완료 알림이 안 온다.

| 옵션 | 언제 |
|---|---|
| `-C <path>` | 작업 디렉터리 고정 |
| `--sandbox workspace-write` | 기본. 파일 쓰기 필요 시 필수 |
| `-c sandbox_workspace_write.network_access=true` | 네트워크가 필요할 때 (아래) |
| `--skip-git-repo-check` | 신뢰 디렉터리 거부 회피 |
| `--json` | JSONL 스트림. `turn.completed` 로 종료 판정 |
| `-o <FILE>` | 최종 메시지 별도 파일 — 결과 회수 자동화 |

## 샌드박스는 네트워크를 막는다

`--sandbox workspace-write` 는 파일 쓰기만 허용하고 **아웃바운드 네트워크를 차단한다**. 원격 API 호출·`npm install`·`git push` 가 섞인 작업에는 켜 줘야 한다.

```bash
-c sandbox_workspace_write.network_access=true
```

안 켜면 실패가 codex 오류로 보이지 않고 **작업 쪽 메시지**로 나온다 — `fetch failed`, `ENOTFOUND`, `npm ERR! network`, `보드 API에 연결할 수 없습니다`. 내 셸에서는 되는 명령이 codex 안에서만 죽으면 이것부터 의심한다. 프로젝트 보드(`npm run board -- …`)도 원격이라 이 옵션이 있어야 읽힌다.

## code-mode host 짝 맞춤

codex 는 셸·파일 도구를 옆자리 `codex-code-mode-host` 프로세스에 위임한다. argv[0] 의 심링크를 **풀지 않고** "심링크가 놓인 디렉터리"에서만 host 를 찾으므로, `codex` 만 새 설치본으로 다시 걸면 짝이 어긋난다.

증상이 특이하다 — **명령은 실제로 성공하는데 결과가 증발한다.** 로그에 `exec … succeeded` 와 진짜 출력이 찍힌 직후 `failed to decode code-mode IPC frame: missing field code_mode_host_duration_ns` 같은 줄이 뜨고, 모델은 `불가: 터미널 도구…` 만 답한다. 새 CLI 가 요구하는 필드를 옛 host 가 모르는 것이라 필드명은 버전마다 다르다 — 필드명이 아니라 **짝이 맞는지**로 판단한다. 그래서 코드나 권한 문제로 오인하기 쉽다.

`~/.zshenv` 의 `codex` 래퍼 함수가 호출마다 짝을 검사해 자동 복구한다. 의심되면 직접 본다:

```bash
[ "$(dirname "$(readlink -f ~/.local/bin/codex)")/codex-code-mode-host" \
  = "$(readlink -f ~/.local/bin/codex-code-mode-host)" ] && echo 짝맞음 || echo 어긋남
```

어긋났으면 `ln -sfn "$(dirname "$(readlink -f ~/.local/bin/codex)")/codex-code-mode-host" ~/.local/bin/codex-code-mode-host`.

래퍼가 없는 머신(또는 zsh 가 아닌 셸)에서는 이 자동 복구가 없다. `~/.zshenv` 에 심는다 — `.zshrc` 는 **대화형 셸에서만** 읽혀서 스크립트·에이전트 호출을 놓친다:

```zsh
codex() {
  local bin=$HOME/.local/bin/codex real want
  if [[ -L $bin ]] && real=$(readlink -f "$bin") && [[ -x $real ]]; then
    want="${real:h}/codex-code-mode-host"
    [[ -x $want && "$(readlink -f "${bin}-code-mode-host" 2>/dev/null)" != "$want" ]] \
      && ln -sfn "$want" "${bin}-code-mode-host"
  fi
  command codex "$@"
}
```

`-x` 두 조건이 안전장치다 — `codex` 심링크가 깨져 있으면 `dirname` 이 `.` 으로 떨어져 host 를 자기 자신을 가리키는 심링크로 만들어 버린다.

- **`codex doctor` 는 이 고장을 못 잡는다.** 도구 루프가 완전히 죽은 상태에서도 `0 fail` 을 낸다. doctor 가 초록이라고 정상이 아니다.
- 우회는 없다. 플래그 이름은 `code_mode` 가 아니라 **`code_mode_host`** 이고(`codex features list` 로 확인), `--disable code_mode_host` 는 fail-closed 라 도구가 아예 사라진다.

## 프롬프트 4-섹션

```markdown
== 정독 ==   읽어야 할 파일
== 구현 ==   파일별 변경 명세
== 자체 검증 ==  통과해야 할 명령 (실제로 돌릴 것)
== 하지 말 것 ==  범위 밖 수정 금지 · git commit/push 금지
```

## 거짓 보고 — 반드시 검증할 것

codex 는 **도구가 없어도 성공을 보고한다.** 실측 2건: 이미지 생성을 시켰더니 코드로 격자를 그려 놓고 "생성 완료"라 했고, 모델이 "그 도구 있음"이라 답해 놓고 실제로는 없었다. **자기보고 도구 목록도 부정확하다.**

1. **프롬프트에 정직성 가드를 넣는다** — `"우회 구현 금지. 지정한 수단이 없으면 산출물을 만들지 말고 '불가: <이유>' 만 출력해라."` 이걸 넣으면 그제야 정직하게 답한다.
2. **완료 알림이 오면 산출물을 직접 연다.** 이미지 진위 판별은 `image-generation.md`.
3. **자체 검증 명령을 메인이 다시 돌린다.** codex 가 PASS 라 적어도 재실행한다.

## 이미지 생성

`image-generation.md` 참고 — 빌트인 `image_gen`(Plus 필요)이 실제로 받는 것(크기·품질 인자 없음 · 157만 화소에 비율만), 프롬프트 양식, 투명 배경, 진위 검사(`check-image.py`), 병렬 세션 함정.

## 막혔을 때

| 증상 | 원인 | 대응 |
|---|---|---|
| `exec … succeeded` 로 출력은 찍혔는데 `failed to decode code-mode IPC frame` → `불가: 터미널 도구…` | `codex-code-mode-host` 가 `codex` 와 다른 설치본 | 위 「짝 맞춤」. `codex doctor` 는 못 잡는다 |
| `fetch failed` · `ENOTFOUND` · `npm ERR! network` — 내 셸에서는 되는데 codex 안에서만 실패 | workspace-write 샌드박스가 네트워크 차단 | `-c sandbox_workspace_write.network_access=true` |
| `Reading additional input from stdin...` 후 무변동 | stdin 미명시 | kill 후 파이프나 `< /dev/null` |
| `The '<모델>' model is not supported...` | `config.toml` 의 `model` 이 이 계정에서 못 쓰는 값 | `~/.codex/config.toml` 의 `model` 을 고친다. `-m` 을 스킬에 박지 않는다 |
| `요구사항이 여러 항목… 착수 전 구현 승인을 확인해야 합니다` 라며 멈춤 | 리포 CLAUDE.md 의 "구현 전 승인" 규칙을 codex 가 자기에게 적용 | 프롬프트 맨 위에 `== 승인 == 사용자가 이미 승인했다. 질문 없이 구현. 질문하고 멈추면 실패` 를 넣는다 |
| `token_revoked` / `expired` / 401 | 앱·CLI 토큰 회전 충돌 (auth.json 이 두 벌) | 앱 종료 → `codex logout && codex login` (아래) |
| `Not inside a trusted directory` | 신뢰 디렉터리 미등록 | `--skip-git-repo-check` |
| `failed to record rollout items` | codex 내부 추적 실패 | 무해 — 무시 |
| 15분+ 로그 무변동 | API timeout | `pkill -9 -f "codex exec.*${TAG}"` 후 재실행 |

`pkill` 은 **반드시 `${TAG}` 로 한정** — 다른 codex 작업을 죽이지 않는다.

### 인증이 꼬일 때 — auth.json 이 두 벌이다

CLI 는 `~/.codex/auth.json`, 앱은 `~/Library/Application Support/orca/codex-runtime-home/home/auth.json`. 리프레시 토큰은 쓸 때마다 회전해서 **앱과 CLI 가 동시에 살아 있으면 서로의 토큰을 무효화**한다.

```bash
osascript -e 'tell application "ChatGPT" to quit'   # 앱을 먼저 끈다
codex logout && codex login
```

**배치를 도는 동안은 앱을 꺼 둔다.** 플랜 변경 직후에도 세션이 갈려 같은 증상이 난다.

## 머지 전 review 2종 (큰 변경일 때)

관점이 달라 둘 다 필요하다. 병렬로 띄운다(둘 다 read-only).

```bash
codex exec review --uncommitted --skip-git-repo-check \
  -o /tmp/codex-logs/review_${TAG}_last.md < /dev/null > /tmp/codex-logs/review_${TAG}.log 2>&1

cat /tmp/codex_adversarial_${TAG}.md | codex exec --skip-git-repo-check \
  -o /tmp/codex-logs/adv_${TAG}_last.md > /tmp/codex-logs/adv_${TAG}.log 2>&1
```

표준 review 는 결함·회귀를 본다. adversarial 은 **"이 설계가 배포 가능한가"** 를 묻는다 — 프롬프트로 자세를 강제한다: 확신을 깨는 것이 임무, 선의·부분 수정에 점수 주지 말 것, happy path 에서만 도는 건 약점으로 볼 것. 공격면은 마이그레이션 손실·스키마 잔재·버전 혼재·롤백 안전성·멱등성·경쟁 조건·빈 상태·관측 공백.

만장일치 Critical 은 머지 전 수정, 단독 지적은 근거를 보고 판단한다. trivial 변경(오타·문서만)이나 사용자가 생략하라면 건너뛴다.
