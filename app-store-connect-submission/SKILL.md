---
name: app-store-connect-submission
description: Use when submitting or resubmitting an iOS app for App Store review in App Store Connect — attaching a build to a version, resubmitting after a rejection, replying to App Review, or when the resubmit button looks disabled and the version page shows a red "제출한 항목이 거부되었습니다" banner.
---

# App Store Connect 제출·재제출

브라우저로 App Store Connect를 몰 때의 절차. 리젝 후 재제출에서 **버튼이 잠긴
것처럼 보이는 구간**이 있는데, 잠긴 게 아니라 두 페이지의 상태가 다른 것이다.

## 재제출 (리젝 → 수정 → 다시 심사)

1. 고칠 것을 고친다 (새 빌드가 필요하면 업로드 → 아래 "빌드 교체")
2. **버전 페이지**(`/distribution/ios/version/inflight`) 우상단 **"심사 업데이트"**
3. 그러면 **제출 페이지**(`/distribution/reviewsubmissions/details/<id>`)로 이동하면서
   항목 상태가 `심사를 통과하지 못함` → **`심사 준비됨`**으로 바뀐다
4. 제출 페이지 우상단 **"앱 심사에 다시 제출"** → `심사 대기 중`

**핵심: 3번이 눈에 안 보인다.** "심사 업데이트"는 제출 다이얼로그를 띄우지 않고
조용히 페이지를 옮기며 상태를 바꾼다. 클릭 직후 화면만 보면 아무 일도 안 난 것 같다.

## 헤매게 만드는 것들

| 증상 | 실제 | 대응 |
|---|---|---|
| 버전 페이지에 빨간 배너 "제출한 항목이 거부되었습니다 / <지침번호>" | 지난 리젝을 알리는 **정보 배너**. 제출을 막는 게 아니다 | 무시하고 "심사 업데이트" 진행 |
| "앱 심사에 다시 제출"이 `disabled` | **낡은 페이지를 읽은 것**. "심사 업데이트"를 거치기 전 상태다 | 3번을 거친 뒤 **다시 읽어서** 상태 확인 |
| "해당 항목을 삭제하고 나중에 다시 제출할 수도 있습니다" 안내문 | 대안 경로일 뿐 **필수가 아니다** | **"제출 취소"에 손대지 말 것** — 정상 경로로 된다 |
| 항목의 "편집" 링크 | 버전 페이지로 돌아가는 링크뿐 | 쓸 일 없다 |

버튼 상태는 스크린샷 말고 DOM으로 확인하는 게 확실하다:
`[...document.querySelectorAll('button')].find(b=>/다시 제출/.test(b.textContent)).disabled`

## 빌드 교체 (버전에 붙은 빌드 바꾸기)

버전 페이지 **빌드** 섹션 → 기존 행 오른쪽 **빨간 −** → "빌드 추가" → 라디오 선택 →
**완료** → 우상단 **저장**. 저장해야 반영된다(사이드바가 `제출 준비 중`으로 바뀐다).

업로드 직후에는 목록에 안 뜬다. TestFlight 탭에서 **`제출 준비 완료`**가 될 때까지
기다린다(보통 수 분). 같은 빌드 번호는 거부되므로 `CURRENT_PROJECT_VERSION`을 올린다.

## 빌드 업로드는 CLI로 (Organizer 불필요)

```bash
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCH" \
  -allowProvisioningUpdates archive

# exportOptions.plist 에 destination=upload 를 넣는 것이 핵심
xcodebuild -exportArchive -archivePath "$ARCH" \
  -exportOptionsPlist exportOptions.plist -exportPath ./export -allowProvisioningUpdates
```
`destination: upload`면 Xcode ▸ Settings ▸ Accounts에 로그인된 계정으로 올라간다.
**그 목록이 비어 있으면 `error: exportArchive Failed to Use Accounts`(exit 70)로 죽는다**
(2026-09-11 실측). 그땐 같은 팀의 App Store Connect API 키를 붙인다 — 로그인 없이 올라가고
배포 서명도 클라우드 서명으로 붙는다(로컬에 배포 인증서가 없어도 된다):

```bash
xcodebuild -exportArchive ... -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_<KID>.p8 \
  -authenticationKeyID "<KID>" -authenticationKeyIssuerID "<ISSUER>"
```
키 ID·Issuer ID는 키체인에 두고 `$(security find-generic-password -a <계정> -s <서비스> -w)`로
명령 안에서만 꺼내 쓴다(출력하지 않는다). 성공하면 로그 끝에 `Upload succeeded`.

## App Review에 회신 (Resolution Center)

제출 페이지 하단 **"앱 심사에 회신"** → 텍스트 영역 → **회신**.
**4,000자 제한**이라 긴 원고는 나눠 보내야 한다. 전송 확인은 `메시지(N개)`의 N 증가로.

## 입력이 안 먹는 폼

스토어 메타데이터(설명·키워드)는 프로그램 입력이 먹지만,
**"앱 심사 정보" 섹션(심사 메모·데모 계정·연락처)은 실제 클릭 + 실제 타이핑만 먹는다.**
`value` setter나 `execCommand`는 DOM만 바꾸고 저장 버튼이 안 켜진다 —
새로고침하면 그 섹션만 비어 있다. 긴 텍스트에 CDP 타임아웃이 떠도 입력은 끝까지
들어가니, 다시 치지 말고 **길이부터 확인**할 것.

기존 메모에 덧붙일 땐 전체를 다시 치지 말고 텍스트영역 클릭 → `cmd+Up`(맨 앞) →
새 문단만 타이핑한다.

**심사 메모 칸도 4,000자 제한**이다(Resolution Center 회신과 같다). 원고가 길면 줄인 판을
따로 만들어 붙이고, 칸을 통째로 바꿀 땐 텍스트영역 실제 클릭 → `cmd+a` → `Delete`로
비운 뒤(길이 0 확인) 타이핑한다. 저장 후 **새로고침해서 길이가 그대로인지** 본다.

## 제출 전에 막히는 지점

`가격 및 사용 가능 여부`가 비어 있으면 심사 추가가 막히는데 **다른 곳엔 경고가 안 뜬다**.
새 앱이면 여기부터 채울 것.
