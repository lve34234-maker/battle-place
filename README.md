# 🎮 배틀플레이스 (Battle Place)

PUBG 스타일 웹 배틀로얄 — **최신 Three.js(r161, ES 모듈)** 로 뼈대부터 재작성.
PBR 빛 반사(환경맵 IBL) · 실제 그림자 · 중력/탄도 물리 · 수축 자기장 · AI 봇.

브라우저만 있으면 바로 실행됩니다. **외부 CDN 의존성 없음** (Three.js는 `vendor/`에 내장).

## 📁 폴더 구조
```
index.html              ← 진입점 (UI + importmap)
src/
 ├─ main.js             ← 오케스트레이션 / 메인 루프
 ├─ config.js          ← 무기·맵·물리 상수
 ├─ engine.js          ← 렌더러/씬/카메라/조명/환경맵(빛 반사)
 ├─ world.js           ← 지형·건물·나무·충돌·전리품
 ├─ input.js           ← 키보드/마우스(포인터락)/터치
 ├─ weapons.js         ← GLB 로딩·뷰모델·탄도 총알·트레이서
 ├─ player.js          ← 이동 물리·1/3인칭 카메라·사격
 ├─ bots.js            ← AI 봇(배회·추격·교전)
 ├─ zone.js            ← 자기장(수축 안전구역)
 └─ ui.js              ← HUD·미니맵·화면 전환
vendor/three/           ← Three.js r161 (내장)
*.glb                   ← 실제 총기 모델 6종 + 차량
```

## 🚀 실행 / 배포
- **로컬**: 폴더에서 정적 서버 실행 후 접속
  ```
  python3 -m http.server 8000   →  http://localhost:8000
  ```
  (ES 모듈이라 `file://` 직접 열기는 안 됨 — 반드시 서버로)
- **GitHub Pages**: Settings → Pages → Branch 선택 → Save → 1~2분 뒤 주소 완성

## 🕹️ 조작 (PUBG 스타일)
| 동작 | 키 |
|------|----|
| 이동 | WASD · 달리기 Shift · 점프 Space |
| 시점 | 마우스 (화면 클릭 → 포인터 잠금) |
| 사격 / 조준 | 좌클릭 / 우클릭 |
| 재장전 | R · 줍기 F |
| 자세 | 웅크리기 C · 엎드리기 Z |
| 무기 전환 | 1 · 2 · 시점전환 V |

모바일은 화면 좌측 조이스틱 + 우측 버튼으로 조작.

## ✨ 구현된 것
- **빛 반사**: `MeshStandardMaterial` PBR + PMREM 환경맵(IBL) → 금속/총기 표면 반사
- **조명/그림자**: 대기 산란 하늘(Sky) + 방향광 + PCF 소프트 섀도우
- **물리**: 중력·점프·건물 AABB 충돌·탄도 낙차(총알이 중력으로 떨어짐)
- **배틀로얄**: 7단계 수축 자기장 + 자기장 데미지 + 60개 전리품 + AI 봇(서로 교전)
