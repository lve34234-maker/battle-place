# 🎮 배틀플레이스 (Battle Place)

브라우저로 바로 돌아가는 3D 게임. **유니티/언리얼 없이** Three.js(웹)로 만들어서
PC·모바일 어디서나 열리고, 나중에 **.exe / .apk** 로도 포장할 수 있어요.

> 참고: 언리얼 엔진은 코드(텍스트)만으로는 만들 수 없어요(에디터에서 만드는 수GB 바이너리).
> 그래서 "고퀄 빛반사 + 현실 지형 + 모두 함께 멀티 + .exe/.apk"라는 목표를
> 실제로 굴러가게 만드는 길로 **웹(Three.js)** 을 골랐습니다.

---

## 🌍 두 가지 모드

| 파일 | 모드 | 내용 |
|---|---|---|
| `survival.html` | **생존 (신규)** | 현실 지형 + PBR 빛반사 + 낮밤 + 채집/제작(석기→현대) + Supabase 멀티 + 나라선택 |
| `index.html` | 배틀로얄 (기존) | 배그식 100인 배틀로얄(봇전), 진짜 총기 GLB |

### ▶ 생존 모드 (`survival.html`)
- **현실적 지형**: 노이즈 기반 산/평야/해변/바다 (모든 접속자 동일한 지형)
- **빛반사**: 환경맵 + ACES 톤매핑 + PBR 재질 (물·금속 반사)
- **생존**: 체력 / 허기 / 갈증 / 스태미나 / 체온 + 낮밤(체온↓) + 모닥불
- **채집 → 제작 테크트리**:
  석기시대(돌도끼·돌창·모닥불) → 청동기·철기(철검·활·방패) →
  중세(석궁·판금갑옷) → 화약(머스킷) → 현대(권총·MP5K·M4A1·KSR-29·AWP)
- **나라 선택** + 머리 위 국기/닉네임, **채팅(Enter)**
- **모두 함께 멀티플레이**: Supabase 실시간 (내 컴퓨터 서버 안 켜도 됨)

조작: 이동 `WASD` · 달리기 `Shift` · 점프 `Space` · 채집/사용 `F` ·
공격/사격 `좌클릭` · 제작 `E` · 재장전 `R` · 무기교체 `1~9` · 채팅 `Enter`

---

## 🟢 멀티플레이 켜기 (Supabase = 서버 대체)

1. [supabase.com](https://supabase.com) 무료 프로젝트 생성
2. (선택) `supabase-schema.sql` 을 SQL Editor에 붙여넣고 RUN — 세이브/리더보드용
3. **Project Settings → API** 에서 `URL` 과 `anon key` 복사
4. `net.js` 맨 위 `SUPABASE_URL`, `SUPABASE_ANON_KEY` 에 붙여넣기
5. 끝! 접속하면 같은 `world` 채널의 모든 사람이 함께 보입니다.

> 값을 안 넣으면 자동으로 **혼자 모드**로 켜집니다 (게임은 항상 실행됨).

---

## 📦 .exe / .apk 만들기
`packaging/README.md` 참고.
- **.exe**: Electron (`packaging/electron`)
- **.apk**: Capacitor (루트 `capacitor.config.json`)

---

## 🚀 웹으로 바로 배포
GitHub Pages: Settings → Pages → Branch `main` → Save →
`https://<아이디>.github.io/battle-place/survival.html`

## 📁 파일
```
survival.html   생존 모드 화면
survival.js     생존 게임 엔진(지형/생존/제작/멀티)
net.js          Supabase 실시간 멀티플레이
supabase-schema.sql   (선택) 세이브/리더보드 테이블
index.html, game.js   기존 배틀로얄
*.glb           무기 모델(M4A1, AWP, KSR-29, MP5K 등)
packaging/      .exe / .apk 빌드 설정
```
