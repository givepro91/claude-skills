#!/usr/bin/env node
// idev — 실기기 iPhone/iPad 조작 CLI (Appium XCUITest + WebDriverAgent)
//
// 에이전트가 손 없이 실기기를 쓰기 위한 얇은 래퍼다. 의존성 없음 (Node 18+ 내장 fetch).
// 세션 id는 상태 파일에 저장돼 명령 사이에 유지된다 — 한 줄씩 실행하며 스크린샷으로 확인하는
// 방식에 맞춰져 있다.
//
//   idev doctor                     전제 조건 점검 (여기부터 시작할 것)
//   idev start [--bundle <id>]      Appium 기동 + 세션 생성
//   idev shot <out.png>             스크린샷
//   idev tap <x> <y>                좌표 탭 (포인트 단위 — idev size로 확인)
//   idev swipe <x1> <y1> <x2> <y2> [ms]
//   idev text "입력할 내용"          포커스된 입력란에 타이핑
//   idev click "<접근성 id>"         이름으로 찾아서 탭 (좌표보다 안정적)
//   idev alert [--button "라벨"]     시스템 권한 팝업 수락 (--dismiss로 거절)
//   idev alert-text                 팝업 문구 읽기
//   idev source [out.xml]           화면 요소 트리
//   idev rec-start / idev rec-stop <out.mp4> [--compress]
//   idev launch|terminate <bundleId>
//   idev size                       화면 크기(포인트)
//   idev raw <METHOD> <path> [json] 탈출구 — 임의 WebDriver 엔드포인트
//   idev stop                       세션 종료
//
// 함정은 SKILL.md에 정리돼 있다. 가장 흔한 것: 기기가 잠겨 있으면 세션 생성이 실패한다.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SERVER = process.env.IDEV_SERVER ?? "http://127.0.0.1:4723";
const STATE_DIR = join(homedir(), ".cache", "idev");
const STATE = join(STATE_DIR, "state.json");
const LOG = join(STATE_DIR, "appium.log");

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
}
function writeState(patch) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// ---------- 기기 탐색 ----------

// devicectl의 Identifier는 UDID가 아니다 — Appium은 xctrace가 보여주는 UDID를 받는다.
function findUdid() {
  const out = sh("xcrun", ["xctrace", "list", "devices"]);
  for (const line of out.split("\n")) {
    if (/simulator/i.test(line)) continue;
    const m = line.match(/\(([\d.]+)\)\s+\(([0-9A-Fa-f-]{25,})\)\s*$/);
    if (m) return { udid: m[2], os: m[1], name: line.split("(")[0].trim() };
  }
  return null;
}

// 팀 id는 프로젝트에서 주워온다 — 인자로 주면 그게 우선.
function findTeam() {
  for (const p of [
    "ios/App/App.xcodeproj/project.pbxproj",
    "ios/App.xcodeproj/project.pbxproj",
  ]) {
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(/DEVELOPMENT_TEAM = ([A-Z0-9]+);/);
    if (m) return m[1];
  }
  return null;
}

function lockState(udid) {
  // devicectl은 UDID도 받는다. 잠겨 있으면 WDA가 "자동화 모드 활성화 시간 초과"로 죽는다.
  try {
    const out = sh("xcrun", ["devicectl", "device", "info", "lockState", "--device", udid]);
    return {
      locked: /passcodeRequired: true/.test(out),
      raw: out.split("\n").filter((l) => l.includes(":")).slice(-3).join(" / "),
    };
  } catch (e) {
    return { locked: null, raw: String(e.message).slice(0, 200) };
  }
}

// ---------- HTTP ----------

async function api(method, path, body) {
  const res = await fetch(SERVER + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.value?.error) {
    die(`${method} ${path} 실패: ${json?.value?.message ?? res.status}`);
  }
  return json.value;
}

const sid = () => readState().sessionId ?? die("세션이 없다 — 먼저 `idev start`");
const S = (p) => `/session/${sid()}${p}`;

// ---------- 명령 ----------

async function serverUp() {
  try {
    const r = await fetch(SERVER + "/status");
    return r.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverUp()) return "이미 떠 있음";
  mkdirSync(STATE_DIR, { recursive: true });
  const fd = openSync(LOG, "a");
  const child = spawn("appium", ["--base-path", "/"], {
    detached: true,
    stdio: ["ignore", fd, fd],
    // 녹화 결과를 base64로 들고 있느라 기본 힙으로는 SIGABRT가 난다 (실측)
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await serverUp()) return `기동됨 (로그: ${LOG})`;
  }
  die(`Appium이 안 뜬다. 로그: ${LOG}`);
}

async function doctor() {
  const dev = findUdid();
  console.log(`기기        ${dev ? `${dev.name} · iOS ${dev.os} · ${dev.udid}` : "❌ 연결 안 됨"}`);
  if (!dev) return;
  const lock = lockState(dev.udid);
  console.log(
    `잠금        ${lock.locked === true ? "❌ 잠김 — 해제하고 자동 잠금을 끌 것" : lock.locked === false ? "해제됨" : `? ${lock.raw}`}`
  );
  console.log(`팀 id       ${findTeam() ?? "프로젝트에서 못 찾음 — --team으로 줄 것"}`);
  let appium = "❌ 없음 — npm i -g appium && appium driver install xcuitest";
  try {
    appium = sh("appium", ["--version"]);
  } catch {}
  console.log(`Appium      ${appium}`);
  console.log(`서버        ${(await serverUp()) ? "응답함" : "꺼짐 (start가 띄운다)"}`);
  let ff = "❌ 없음 — brew install ffmpeg (녹화 압축에 필요)";
  try {
    ff = sh("ffmpeg", ["-version"]).split("\n")[0].slice(0, 40);
  } catch {}
  console.log(`ffmpeg      ${ff}`);
  const st = readState();
  console.log(`세션        ${st.sessionId ?? "없음"}`);
}

async function start(args) {
  const dev = findUdid() ?? die("연결된 실기기가 없다 (USB·신뢰 확인)");
  const udid = args["--udid"] ?? dev.udid;
  const team = args["--team"] ?? findTeam() ?? die("팀 id를 못 찾았다 — --team <ID>");
  const lock = lockState(udid);
  if (lock.locked === true) {
    die("기기가 잠겨 있다. 잠금을 해제하고 설정 ▸ 디스플레이 ▸ 자동 잠금 = 안 함으로 둘 것.");
  }
  console.log(await ensureServer());

  const caps = {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    "appium:udid": udid,
    "appium:xcodeOrgId": team,
    "appium:xcodeSigningId": "Apple Development",
    // 기본 com.facebook.WebDriverAgentRunner는 남의 네임스페이스라 내 팀으로 App ID 등록이 안 된다.
    // 앱 번들 id의 앞 두 마디를 빌려 쓴다 (com.givepro.nolgot → com.givepro.WebDriverAgentRunner).
    "appium:updatedWDABundleId":
      args["--wda-bundle"] ??
      (args["--bundle"]?.split(".").slice(0, 2).join(".") ?? "com.example") +
        ".WebDriverAgentRunner",
    "appium:noReset": true,
    "appium:newCommandTimeout": 0, // 사람이 중간에 확인하는 동안 세션이 죽지 않게
    "appium:wdaLaunchTimeout": 600000, // 첫 실행은 WDA 빌드까지 해서 오래 걸린다
  };
  if (args["--bundle"]) caps["appium:bundleId"] = args["--bundle"];

  const v = await api("POST", "/session", {
    capabilities: { alwaysMatch: caps, firstMatch: [{}] },
  });
  writeState({ sessionId: v.sessionId, udid, team, bundle: args["--bundle"] ?? null });
  console.log(`세션 ${v.sessionId}`);
}

async function shot(out) {
  const b64 = await api("GET", S("/screenshot"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, Buffer.from(b64, "base64"));
  console.log(out);
}

const pointer = (acts) => ({
  actions: [{ type: "pointer", id: "f1", parameters: { pointerType: "touch" }, actions: acts }],
});

async function tap(x, y) {
  await api("POST", S("/actions"), pointer([
    { type: "pointerMove", duration: 0, x: +x, y: +y },
    { type: "pointerDown", button: 0 },
    { type: "pause", duration: 80 },
    { type: "pointerUp", button: 0 },
  ]));
  console.log(`tap ${x},${y}`);
}

async function swipe(x1, y1, x2, y2, ms = 400) {
  await api("POST", S("/actions"), pointer([
    { type: "pointerMove", duration: 0, x: +x1, y: +y1 },
    { type: "pointerDown", button: 0 },
    { type: "pointerMove", duration: +ms, x: +x2, y: +y2 },
    { type: "pointerUp", button: 0 },
  ]));
  console.log(`swipe ${x1},${y1} → ${x2},${y2}`);
}

async function click(name) {
  const el = await api("POST", S("/element"), { using: "accessibility id", value: name });
  const id = Object.values(el)[0];
  await api("POST", S(`/element/${id}/click`), {});
  console.log(`click "${name}"`);
}

async function typeText(t) {
  // 포커스된 요소에 보낸다 — 입력란을 먼저 탭할 것. W3C key actions라 한글도 그대로 들어간다.
  const keys = [...t].flatMap((ch) => [
    { type: "keyDown", value: ch },
    { type: "keyUp", value: ch },
  ]);
  await api("POST", S("/actions"), { actions: [{ type: "key", id: "kbd", actions: keys }] });
  console.log(`type "${t}"`);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const pos = [];
  const args = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith("--")) {
      const next = rest[i + 1];
      if (next && !next.startsWith("--")) args[rest[i]] = rest[++i];
      else args[rest[i]] = true;
    } else pos.push(rest[i]);
  }

  switch (cmd) {
    case "doctor":
      return doctor();
    case "start":
      return start(args);
    case "stop": {
      await api("DELETE", S(""));
      writeState({ sessionId: null });
      return console.log("세션 종료");
    }
    case "size":
      return console.log(JSON.stringify(await api("GET", S("/window/rect"))));
    case "shot":
      return shot(pos[0] ?? "shot.png");
    case "tap":
      return tap(pos[0], pos[1]);
    case "swipe":
      return swipe(pos[0], pos[1], pos[2], pos[3], pos[4]);
    case "click":
      return click(pos[0]);
    case "text":
      return typeText(pos.join(" "));
    case "alert-text":
      return console.log(await api("GET", S("/alert/text")));
    case "alert": {
      // 시스템 권한 팝업은 앱의 요소 트리에 안 나온다 — 이 엔드포인트로만 다룬다.
      const path = args["--dismiss"] ? "/alert/dismiss" : "/alert/accept";
      await api("POST", S(path), args["--button"] ? { buttonLabel: args["--button"] } : {});
      return console.log(`alert ${args["--dismiss"] ? "dismiss" : "accept"}`);
    }
    case "source": {
      const xml = await api("GET", S("/source"));
      if (pos[0]) {
        writeFileSync(pos[0], xml);
        return console.log(pos[0]);
      }
      return console.log(xml.slice(0, 4000));
    }
    case "launch":
      await api("POST", S("/appium/device/activate_app"), { appId: pos[0] });
      return console.log(`launch ${pos[0]}`);
    case "terminate":
      await api("POST", S("/appium/device/terminate_app"), { appId: pos[0] });
      return console.log(`terminate ${pos[0]}`);
    case "rec-start": {
      // 네이티브 해상도·25fps로 받으면 stop 때 base64가 GB급이 되어 Appium이 죽는다 (실측).
      // 캡처 단계에서 줄여 받는 게 유일하게 안전한 방법이다.
      const fps = +(args["--fps"] ?? 10);
      await api("POST", S("/appium/start_recording_screen"), {
        options: {
          timeLimit: +(args["--limit"] ?? 1800),
          videoFps: fps,
          videoScale: args["--scale"] ?? "-2:1280",
          videoQuality: args["--quality"] ?? "medium",
        },
      });
      // fps를 남겨 둔다 — 결과 컨테이너는 실제 캡처 속도와 무관하게 25fps로 찍혀 나와서
      // 그대로 재생하면 2.5배 빨리 감긴다 (2026-08-17 실측). rec-stop이 이 값으로 되돌린다.
      writeState({ recFps: fps });
      return console.log("녹화 시작");
    }
    case "rec-stop": {
      const out = pos[0] ?? "recording.mp4";
      const b64 = await api("POST", S("/appium/stop_recording_screen"), {});
      if (!b64) die("녹화 결과가 비었다 — rec-start를 먼저 했는지 확인");
      const raw = out.replace(/\.mp4$/, "") + ".raw.mp4";
      writeFileSync(raw, Buffer.from(b64, "base64"));
      // 컨테이너는 늘 25fps로 찍혀 나오는데 실제 캡처는 videoFps다 — 그대로 두면 빨리 감긴다.
      // itsscale로 타임스탬프만 늘려 실시간으로 되돌린다 (재인코딩 없음).
      const scale = 25 / +(args["--fps"] ?? readState().recFps ?? 10);
      const enc = args["--compress"]
        ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
           "-vf", "scale=-2:1280"]
        : ["-c", "copy"];
      sh("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
        "-itsscale", String(scale), "-i", raw, ...enc, out]);
      console.log(`${out} (원본 ${raw}, ${scale}× 되돌림)`);
      return;
    }
    case "raw": {
      const [method, path, json] = pos;
      return console.log(JSON.stringify(await api(method, S(path), json ? JSON.parse(json) : undefined)));
    }
    default:
      console.log(readFileSync(new URL(import.meta.url)).toString().split("\n")
        .filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n"));
  }
}

main();
