# claude-skills

Claude Code 에서 쓰는 개인 스킬 모음. 이 저장소가 곧 `~/.claude/skills` 다.

| 스킬 | 언제 |
|---|---|
| `codex` | 로컬 codex CLI 에 구현·이미지 생성을 위임할 때, 그리고 codex 가 이상하게 굴 때. 빌트인 `image_gen` 이 실제로 받는 것·투명 배경·진위 검사(`check-image.py`)는 `codex/image-generation.md` |
| `ios-device-automation` | 실물 iPhone·iPad 를 손 없이 몰 때(탭·스와이프·권한 창·스크린샷·녹화). `idev.mjs` |
| `app-store-connect-submission` | App Store Connect 에서 심사 제출·리젝 후 재제출 |
| `work-report-artifact` | 작업 끝에 패치노트 느낌의 보고서 아티팩트를 만들 때. `template.html` |

문서 안의 수치와 함정은 「실측」 날짜가 붙은 것만 사실로 적는다. 추정은 추정이라고 적는다.

## 설치

```bash
git clone https://github.com/givepro91/claude-skills ~/.claude/skills
```

이미 `~/.claude/skills` 가 있으면 필요한 스킬 폴더만 복사한다. 키·기기 식별자·계정은 들어 있지 않다 — 전부 자리표시자다.
