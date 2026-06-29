# 📦 .exe / .apk 만들기 (패키징)

웹 게임을 그대로 **Windows .exe** 와 **Android .apk** 로 만들 수 있어요.
게임 코드를 바꾸지 않고 "감싸기"만 하면 됩니다.

---

## 1) Windows 실행파일 (.exe) — Electron

준비물: [Node.js](https://nodejs.org) 설치.

```bash
cd packaging/electron
npm install
npm start          # 바로 실행해서 확인
npm run dist       # dist/ 폴더에 설치용 .exe 생성
```

- `packaging/electron/main.js` 가 게임 폴더(상위)를 통째로 띄웁니다.
- 빌드 결과물은 `packaging/electron/dist/` 에 생깁니다.

---

## 2) Android 앱 (.apk) — Capacitor

준비물: Node.js + [Android Studio](https://developer.android.com/studio).

```bash
# 프로젝트 루트(= index.html 있는 곳)에서
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android

npx cap init "BattlePlace" "com.battleplace.survival" --web-dir=.
npx cap add android
npx cap copy
npx cap open android      # Android Studio가 열림 → Build > Build APK
```

- `capacitor.config.json` 은 이미 루트에 만들어 뒀습니다.
- `--web-dir=.` 는 "현재 폴더 전체가 웹앱"이라는 뜻 (index.html / survival.html 포함).
- 모바일에선 화면 터치 버튼이 자동으로 나옵니다.

> 팁: 모바일은 무거우니 GLB 모델 수/지형 세그먼트를 줄이면 더 부드럽습니다.

---

## 3) 그냥 웹으로 배포 (가장 쉬움)

GitHub Pages: Settings → Pages → Branch `main` → Save.
1~2분 뒤 `https://<아이디>.github.io/battle-place/survival.html` 로 접속.
