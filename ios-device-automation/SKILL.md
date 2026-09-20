---
name: ios-device-automation
description: Use when a task needs a physically connected iPhone or iPad driven without human hands — tapping, swiping, typing, granting system permission prompts, taking device screenshots, or recording the device screen (App Store review demo videos, real-device bug reproduction, verifying a build on hardware rather than a simulator). Also use when simulator automation (idb/simctl) is insufficient because the behavior only appears on real hardware.
---

# iOS 실기기 자동화

시뮬레이터가 아니라 **USB로 연결된 실제 아이폰**을 에이전트가 조작한다.
탭·스와이프·타이핑·시스템 권한 팝업 수락·스크린샷·화면 녹화까지 전부 CLI로 된다.

핵심: **Appium XCUITest 드라이버 + WebDriverAgent(WDA)**. WDA는 애플의 UI 테스트 프레임워크
위에서 도는 앱이라, 앱 안뿐 아니라 **시스템 권한 팝업까지** 다룰 수 있다 — 이게 스크린샷만
찍는 다른 방법들과 갈리는 지점이다.

## 언제 쓰나

- App Store 심사가 요구하는 **실기기 데모 영상** (Guideline 2.1은 시뮬레이터 녹화를 인정하지 않는다)
- 실기기에서만 재현되는 버그 (WKWebView 제스처, 권한 영속성, 카메라·위치 등 하드웨어)
- 배포 전 실기기 회귀 확인

**안 쓰는 경우**: 시뮬레이터로 충분하면 시뮬레이터가 훨씬 빠르다 (`simctl` + `idb`).
`idb ui tap`은 **시뮬레이터 전용**이다 — 실기기에는 안 붙는다.

## 준비 (1회)

```bash
brew install ffmpeg                      # 녹화 압축용
npm i -g appium && appium driver install xcuitest
```

기기 쪽: USB 연결 · 이 맥을 **신뢰** · **개발자 모드 켜기**(설정 ▸ 개인정보 보호 및 보안 ▸ 개발자 모드).
서명은 유료/개인 팀 아무거나 되지만 **팀 id**가 필요하다 (Xcode 프로젝트의 `DEVELOPMENT_TEAM`).

## 쓰는 법

스크립트를 직접 실행한다 (shebang·실행권한 있음). **`IDEV="node …"` 같은 변수에 담지 말 것** —
zsh는 그 문자열 전체를 한 명령 이름으로 읽어 `no such file or directory`가 난다.

```bash
IDEV=~/.claude/skills/ios-device-automation/idev.mjs   # 경로만 담는다

$IDEV doctor                       # 기기·잠금·팀·Appium·ffmpeg·세션 한눈에
$IDEV start --bundle com.acme.app  # Appium 기동 + WDA 설치 + 세션 (첫 회 2~5분)
$IDEV size                         # 좌표는 포인트 단위 (예: 393x852)
$IDEV shot /tmp/1.png              # 찍고 Read로 눈으로 확인
$IDEV tap 196 640
$IDEV swipe 200 700 200 300 500
$IDEV click "저장"                  # 접근성 id로 — 좌표보다 안정적
$IDEV alert-text                   # 권한 팝업 문구 읽기
$IDEV alert --button "앱을 사용하는 동안 허용"
$IDEV text "hello"                 # 입력란을 먼저 탭할 것
$IDEV rec-start
$IDEV rec-stop /tmp/demo.mp4 --compress
$IDEV stop
```

**작업 리듬**: 한 동작 → `shot` → 이미지 확인 → 다음 동작. 화면을 안 보고 좌표를 연달아
쏘면 어디서 어긋났는지 알 수 없다. 좌표는 스크린샷 픽셀이 아니라 **포인트**다
(`size`로 확인하고, 스크린샷 크기와 다르면 비율로 환산).

## 함정 (실측)

| 증상 | 원인 | 처방 |
|---|---|---|
| `xcodebuild failed with code 65` + `Timed out while enabling automation mode` | **기기가 잠겨 있다.** 로그를 파면 `The device is passcode protected`가 같이 나온다 | 잠금 해제 + 설정 ▸ 디스플레이 ▸ **자동 잠금 = 안 함**. `doctor`가 미리 잡아준다 |
| Appium이 UDID를 못 찾는다 | `devicectl list devices`의 **Identifier는 UDID가 아니다** (CoreDevice UUID) | `xcrun xctrace list devices`의 괄호 값을 쓴다 (`idev`는 이걸 자동으로 한다) |
| WDA 서명 실패 | 기본 번들 id `com.facebook.WebDriverAgentRunner`는 남의 네임스페이스 | `updatedWDABundleId`를 내 도메인으로 (`idev`가 앱 번들 id에서 유도) |
| 권한 팝업이 요소 트리에 없다 | 시스템 알림은 앱이 아니라 springboard 소유 | `find`/`click` 말고 `alert-text` · `alert --button` |
| 녹화 파일이 거대하다 | 네이티브 해상도 MJPEG **초당 ~2MB** (4분이면 500MB) | `rec-stop --compress` (실측: 3.9초 8MB → **97KB**, 590×1280) |
| **녹화본이 2.5배 빨리 감긴다** | 컨테이너 헤더는 실제 캡처 속도와 무관하게 **늘 25fps**로 찍힌다 — 10fps로 받으면 4분이 96초가 된다 (2026-08-17 실측: 2,220프레임 = 실시간 222초인데 88.8초로 표기) | `idev`가 `rec-stop`에서 `-itsscale 25/fps`로 되돌린다(재인코딩 없음). 직접 WDA를 쓴다면 **파일 길이를 손목시계와 대조해 볼 것** — 화면 속 상태바 시계가 60초에 1분씩 가는지 보면 즉시 안다 |
| **긴 녹화를 stop하면 Appium 서버가 죽는다**(`exit 134`, 이후 전 명령이 ECONNREFUSED) | 결과를 base64로 통째 메모리에 올린다 — 7분치면 1GB가 넘는다 | `idev`는 캡처 단계에서 10fps·720p로 줄여 받고 서버 힙도 8GB로 띄운다. **긴 시연은 단계별로 끊어 찍고 나중에 이어붙이는 편이 안전하다** |
| 세션이 조용히 죽는다 | `newCommandTimeout` 기본값이 60초 | `idev`는 0(무제한)으로 연다. 직접 caps를 쓸 땐 반드시 넣을 것 |
| 녹화본에 남의 알림 배너가 찍힌다 | 실기기는 실사용 기기다 | **녹화 전 방해금지(집중 모드) 켜기** — 실측으로 카톡·앱 배너가 화면 위로 떴다 |
| **녹화본이 전 구간 검은 화면**(상태바만 나온다) | **녹화를 건 뒤 앱을 재시작**했다. `rec-start` 다음에 `devicectl process launch --terminate-existing` 을 넣었더니 110초가 통째로 날아갔다 — 캡처가 새 프로세스를 못 따라간다. **`shot` 도 같이 검게 나오므로** 스크린샷으로 확인해도 안 걸러진다 (2026-08-17 실측: 고유색 367 vs 정상 45,207) | **콜드 스타트는 `rec-start` 앞에서 끝내고**, 녹화는 앱의 첫 화면부터 시작한다. 「앱 실행 순간」이 꼭 필요하면 홈 화면에서 아이콘을 탭하는 쪽으로 찍는다. 스타트 직후 스크린샷의 **고유색이 1,000 을 넘는지**로 렌더링을 확인하고 나서 녹화를 걸 것 |
| 앱을 새로 깔면 홈 화면에서 아이콘을 못 찾는다 | 새 앱은 마지막 페이지나 앱 보관함으로 간다 | 홈 화면 하단 **검색 알약 → 앱 이름 타이핑 → 결과 탭**. 페이지를 뒤지는 것보다 짧고 녹화본도 깔끔하다 |

### 웹뷰 앱(Capacitor·Cordova·React Native WebView)은 좌표로만 잡힌다

실측: Capacitor **Release** 빌드에서 `GET /contexts`가 `["NATIVE_APP"]`만 돌려줬고,
`accessibility id`도 `-ios predicate string`(`label CONTAINS …`)도 웹 콘텐츠를 못 찾았다.
웹 화면은 XCUITest에 통째로 불투명한 한 덩어리다.

→ **`click` 대신 `shot` + `tap` 조합을 쓴다.** 스크린샷을 Read로 보고 좌표를 읽어
`size`(포인트)와 스크린샷 픽셀의 비율로 환산해 탭한다.
(웹 컨텍스트가 열리는 빌드라면 `/contexts`에 `WEBVIEW_*`가 나오고 CSS 셀렉터를 쓸 수 있다 —
디버그 빌드에서 먼저 `/contexts`를 확인해 볼 것.)

**하지 말 것**: ffmpeg로 아이폰 화면을 잡으려는 시도. `avfoundation`은 아이폰의 **카메라**만
노출하고 화면은 QuickTime이 쓰는 CoreMediaIO DAL 장치라 열리지 않는다. 화면 녹화는 WDA 경로로.

## 사람이 반드시 해야 하는 것

에이전트가 대신 못 하는 것은 **딱 세 가지**다. 시작 전에 확인시킬 것:

1. 케이블 연결과 **이 컴퓨터 신뢰**
2. **개발자 모드** 켜기 (최초 1회, 재부팅 동반)
3. **잠금 해제 상태 유지** (자동 잠금 끄기)

그 외 — 앱 설치·실행·탭·타이핑·권한 허용·녹화 — 는 전부 자동화된다.

## 곁들여 쓰는 것

```bash
xcrun devicectl device info lockState --device <UDID>      # 잠금 확인
xcrun devicectl device install app --device <UDID> <.app>  # 설치
xcrun devicectl device uninstall app --device <UDID> <번들id>  # 삭제(= 권한 초기화)
```

**권한 프롬프트를 다시 보고 싶으면 앱을 지웠다 다시 깐다** — 실기기에는 시뮬레이터의
`simctl privacy reset`에 해당하는 게 없다. 심사 데모 영상처럼 프롬프트가 화면에 나와야 할 때 필수.

## 뒷정리

`idev stop`으로 세션을 닫는다. Appium 서버는 백그라운드에 남으므로 필요 없으면
`pkill -f "appium --base-path"`. WDA 앱(`*.WebDriverAgentRunner`)은 기기에 남는데,
다음 세션이 재사용하므로 지우지 않는 편이 빠르다.
