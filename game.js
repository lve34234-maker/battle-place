"use strict";
/* ============================================================
   배틀플레이스 game.js
   - 네가 준 진짜 총기/차량 모델(GLB)을 불러와서 사용.
   - 배그(PUBG) 스타일 조작: 3인칭 기본, 우클릭 조준, 자세(서기/앉기/엎드리기).
   ============================================================ */

/* ---------- 총기 7종 능력치 + 사용할 GLB 모델 ---------- */
const WEAPONS = {
  m4a1:   {name:"M4A1",         dmg:28, rpm:660, range:120, mag:30, reload:2.4, mode:"auto",   recoil:1.3, spread:0.8, model:"m4a1"},
  m4a1_s: {name:"M4A1-S",       dmg:30, rpm:600, range:130, mag:25, reload:2.5, mode:"auto",   recoil:1.1, spread:0.6, model:"m4a1_s"},
  mp5k:   {name:"MP5K",         dmg:20, rpm:900, range:60,  mag:30, reload:2.0, mode:"auto",   recoil:0.8, spread:1.2, model:"mp5k"},
  ksr29:  {name:"KSR-29",       dmg:95, rpm:50,  range:400, mag:5,  reload:3.5, mode:"single", recoil:4.0, spread:0.05,model:"ksr29"},
  awp:    {name:"AWP",          dmg:120,rpm:41,  range:500, mag:5,  reload:3.8, mode:"single", recoil:5.0, spread:0.02,model:"awp"},
  ss55:   {name:"SS-55",        dmg:40, rpm:400, range:150, mag:20, reload:2.8, mode:"auto",   recoil:1.8, spread:0.9, model:"ss55"},
};
const WEAPON_IDS = Object.keys(WEAPONS);

/* ---------- 전역 설정 ---------- */
const CFG = {
  mapSize: 300, maxHealth: 100,
  walkSpeed: 6, runSpeed: 10, crouchSpeed: 3, proneSpeed: 1.5,
  jumpForce: 7.5, gravity: -22,
  zonePhases: 6, zoneWait: 18, zoneShrink: 14, zoneDPS: 4,
  pickRange: 3.5, vehicleRange: 5,
};

/* 자세별 카메라 높이/이동속도 */
const STANCE = {
  stand:  {h:1.7,  speed:1.0,  label:"서기"},
  crouch: {h:1.1,  speed:0.5,  label:"앉기"},
  prone:  {h:0.5,  speed:0.25, label:"엎드림"},
};

/* ---------- 전역 변수 ---------- */
let scene,camera,renderer,clock;
let world={buildings:[],trees:[],loot:[],vehicles:[]};
let bots=[],tracers=[];
let zone,zoneMesh;
let isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
let state="loading";
let stats={kills:0,alive:0};
const glbModels={}; // 불러온 GLB 보관 {m4a1: THREE.Group, ...}

/* 플레이어 상태 */
const P={
  pos:new THREE.Vector3(0,1.7,0), vel:new THREE.Vector3(),
  yaw:0, pitch:0, onGround:true,
  hp:CFG.maxHealth, nick:"플레이어",
  weapons:[null,null], ammo:[0,0], slot:0,
  nextFire:0, reloading:false, reloadEnd:0,
  stance:"stand", aiming:false, tpp:true,
  inVehicle:null, heldModel:null,
};

/* ---------- 입력 ---------- */
const keys={};
const input={moveX:0,moveY:0,fire:false,jump:false,run:false,reload:false,pick:false};

addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(state!=='playing')return;
  if(e.code==='KeyR')input.reload=true;
  if(e.code==='KeyF'){ if(!tryVehicle())input.pick=true; }
  if(e.code==='KeyC')toggleStance('crouch');
  if(e.code==='KeyZ')toggleStance('prone');
  if(e.code==='KeyV')P.tpp=!P.tpp;
  if(e.code==='Digit1')switchWeapon(0);
  if(e.code==='Digit2')switchWeapon(1);
  if(e.code==='Space')input.jump=true;
});
addEventListener('keyup',e=>{keys[e.code]=false;});
addEventListener('mousedown',e=>{
  if(state!=='playing')return;
  if(e.button===0)input.fire=true;
  if(e.button===2){P.aiming=true;}
});
addEventListener('mouseup',e=>{
  if(e.button===0)input.fire=false;
  if(e.button===2)P.aiming=false;
});
addEventListener('contextmenu',e=>e.preventDefault()); // 우클릭 메뉴 막기
addEventListener('mousemove',e=>{
  if(state!=='playing'||isMobile)return;
  if(document.pointerLockElement){
    const sens=P.aiming?0.0013:0.0024;
    P.yaw-=e.movementX*sens;
    P.pitch-=e.movementY*sens;
    P.pitch=Math.max(-1.3,Math.min(1.3,P.pitch));
  }
});

function toggleStance(s){
  P.stance=(P.stance===s)?"stand":s;
  document.getElementById('stanceLbl').textContent=STANCE[P.stance].label;
}

/* ---------- 모델 로딩 ---------- */
function loadAllModels(done){
  const list=[...WEAPON_IDS.map(id=>WEAPONS[id].model),"c4"];
  const uniq=[...new Set(list)];
  let loaded=0, finished=false;
  const bar=document.getElementById('loadBar');
  const txt=document.getElementById('loadTxt');

  function step(name, ok){
    loaded++;
    bar.style.width=(loaded/uniq.length*100)+"%";
    txt.textContent=`모델 불러오는 중... (${loaded}/${uniq.length})`;
    if(loaded>=uniq.length && !finished){
      finished=true;
      txt.textContent="준비 완료!";
      setTimeout(done,250);
    }
  }

  // 안전장치: 8초 안에 안 끝나면 그냥 시작(못 받은 총은 임시 박스)
  setTimeout(()=>{ if(!finished){ finished=true; txt.textContent="시작!"; setTimeout(done,150); } }, 8000);

  uniq.forEach(name=>{
    fetch(name+".glb")
      .then(r=>{ if(!r.ok) throw new Error("HTTP "+r.status); return r.arrayBuffer(); })
      .then(buf=>{
        try{ glbModels[name]=parseGLB(buf); }
        catch(e){ console.warn("파싱 실패:",name,e); }
        step(name,true);
      })
      .catch(err=>{ console.warn("로드 실패:",name,err); step(name,false); });
  });
}

/* ====== 내장 미니 GLB 로더 (외부 라이브러리 불필요) ======
   우리 모델은 POSITION/NORMAL/TEXCOORD_0/INDICES, 삼각형만 써서
   이 가벼운 파서로 충분히 읽을 수 있음. */
function parseGLB(buffer){
  const dv=new DataView(buffer);
  // 헤더: magic(0x46546C67="glTF"), version, length
  const magic=dv.getUint32(0,true);
  if(magic!==0x46546C67) throw new Error("GLB 아님");
  let off=12, json=null, bin=null;
  while(off<dv.byteLength){
    const clen=dv.getUint32(off,true);
    const ctype=dv.getUint32(off+4,true);
    const cstart=off+8;
    if(ctype===0x4E4F534A){ // "JSON"
      json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,cstart,clen)));
    }else if(ctype===0x004E4942){ // "BIN"
      bin=new Uint8Array(buffer,cstart,clen);
    }
    off=cstart+clen+ (clen%4?4-clen%4:0); // 4바이트 정렬
  }
  if(!json) throw new Error("JSON 없음");

  // accessor 데이터를 꺼내는 함수
  const compSize={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4};
  const typeNum={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  function readAccessor(idx){
    const acc=json.accessors[idx];
    const bv=json.bufferViews[acc.bufferView];
    const start=(bv.byteOffset||0)+(acc.byteOffset||0);
    const count=acc.count*typeNum[acc.type];
    const ct=acc.componentType;
    if(ct===5126) return new Float32Array(bin.buffer, bin.byteOffset+start, count);
    if(ct===5125) return new Uint32Array(bin.buffer, bin.byteOffset+start, count);
    if(ct===5123) return new Uint16Array(bin.buffer, bin.byteOffset+start, count);
    if(ct===5121) return new Uint8Array(bin.buffer, bin.byteOffset+start, count);
    throw new Error("미지원 componentType "+ct);
  }

  // 텍스처 이미지(있으면) → THREE.Texture
  function loadTexture(matIdx,cb){
    try{
      const mat=json.materials[matIdx];
      const baseTex=mat&&mat.pbrMetallicRoughness&&mat.pbrMetallicRoughness.baseColorTexture;
      if(!baseTex) return cb(null);
      const tex=json.textures[baseTex.index];
      const img=json.images[tex.source];
      if(img.bufferView===undefined) return cb(null);
      const bv=json.bufferViews[img.bufferView];
      const start=bv.byteOffset||0;
      const slice=bin.slice(start,start+bv.byteLength);
      const blob=new Blob([slice],{type:img.mimeType||"image/png"});
      const url=URL.createObjectURL(blob);
      const t=new THREE.TextureLoader().load(url,()=>cb(t));
      t.flipY=false; // glTF는 flipY=false
    }catch(e){ cb(null); }
  }

  // 메시들을 합쳐 하나의 Group으로
  const group=new THREE.Group();
  json.meshes.forEach(mesh=>{
    mesh.primitives.forEach(prim=>{
      const geo=new THREE.BufferGeometry();
      const pos=readAccessor(prim.attributes.POSITION);
      geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
      if(prim.attributes.NORMAL!==undefined)
        geo.setAttribute('normal',new THREE.BufferAttribute(readAccessor(prim.attributes.NORMAL),3));
      else geo.computeVertexNormals();
      if(prim.attributes.TEXCOORD_0!==undefined)
        geo.setAttribute('uv',new THREE.BufferAttribute(readAccessor(prim.attributes.TEXCOORD_0),2));
      if(prim.indices!==undefined){
        const idx=readAccessor(prim.indices);
        geo.setIndex(new THREE.BufferAttribute(idx,1));
      }
      // 기본 재질 (색은 glTF baseColorFactor 또는 회색)
      let color=0xaaaaaa;
      const m=json.materials&&prim.material!==undefined?json.materials[prim.material]:null;
      if(m&&m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorFactor){
        const c=m.pbrMetallicRoughness.baseColorFactor;
        color=new THREE.Color(c[0],c[1],c[2]).getHex();
      }
      const material=new THREE.MeshLambertMaterial({color});
      const mObj=new THREE.Mesh(geo,material);
      // 텍스처 비동기 적용
      if(prim.material!==undefined)
        loadTexture(prim.material,tex=>{ if(tex){ material.map=tex; material.color.set(0xffffff); material.needsUpdate=true; } });
      group.add(mObj);
    });
  });
  // 크기 정규화는 이미 변환 때 했으므로 그대로
  return group;
}

/* GLB 복제본 만들기 (여러 곳에 같은 모델 쓸 때) */
function cloneModel(name){
  const src=glbModels[name];
  if(!src) return null;
  return src.clone(true);
}

/* ---------- 시작 흐름 ---------- */
window.addEventListener('load',()=>{
  loadAllModels(()=>{
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('start').classList.remove('hidden');
    state="menu";
  });
});
document.getElementById('startBtn').onclick=startGame;
document.getElementById('againBtn').onclick=()=>location.reload();

function startGame(){
  P.nick=(document.getElementById('nick').value.trim())||("플레이어"+Math.floor(Math.random()*9000+1000));
  const botN=parseInt(document.getElementById('botCount').value);
  document.getElementById('start').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  if(isMobile)document.getElementById('touch').classList.remove('hidden');

  initThree(); buildWorld(); spawnBots(botN); spawnPlayer();
  stats.alive=botN+1; stats.kills=0;
  state="playing";
  if(!isMobile)renderer.domElement.requestPointerLock();
  clock=new THREE.Clock();
  animate();
}
document.addEventListener('click',()=>{
  if(state==='playing'&&!isMobile&&!document.pointerLockElement)
    renderer.domElement.requestPointerLock();
});

/* ---------- Three 초기화 ---------- */
function initThree(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x9fb8cc);
  scene.fog=new THREE.Fog(0x9fb8cc,90,320);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,0.1,900);
  renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(innerWidth,innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  document.body.appendChild(renderer.domElement);

  const sun=new THREE.DirectionalLight(0xfff0d4,1.15);
  sun.position.set(80,140,50);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  const sc=sun.shadow.camera;sc.left=-180;sc.right=180;sc.top=180;sc.bottom=-180;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe0ff,0x4a5a3a,0.65));

  addEventListener('resize',()=>{
    camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
  });
}

/* ---------- 월드 ---------- */
function buildWorld(){
  const S=CFG.mapSize;
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(S*2,S*2),
    new THREE.MeshLambertMaterial({color:0x5e7d44}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

  const roadMat=new THREE.MeshLambertMaterial({color:0x4a4a4a});
  [[S*2,14],[14,S*2]].forEach(([w,h])=>{
    const r=new THREE.Mesh(new THREE.PlaneGeometry(w,h),roadMat);
    r.rotation.x=-Math.PI/2;r.position.y=0.02;scene.add(r);
  });

  const cols=[0xb0a88f,0x9a8d77,0xc4b9a0,0x8a8175,0xa89b85,0x6b6f5c];
  for(let i=0;i<48;i++){
    const w=8+Math.random()*16,d=8+Math.random()*16,h=6+Math.random()*20;
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
      new THREE.MeshLambertMaterial({color:cols[i%cols.length]}));
    let x,z;do{x=(Math.random()-0.5)*S*1.7;z=(Math.random()-0.5)*S*1.7;}
    while(Math.abs(x)<16&&Math.abs(z)<16);
    b.position.set(x,h/2,z);b.castShadow=true;b.receiveShadow=true;scene.add(b);
    world.buildings.push({x,z,w,d,h});
    if(Math.random()<0.85)spawnLoot(x+(Math.random()-0.5)*w,z+(Math.random()-0.5)*d);
  }
  for(let i=0;i<60;i++){
    const x=(Math.random()-0.5)*S*1.85,z=(Math.random()-0.5)*S*1.85;
    const t=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.55,4,6),
      new THREE.MeshLambertMaterial({color:0x6b4a2b}));
    t.position.set(x,2,z);t.castShadow=true;scene.add(t);
    const lv=new THREE.Mesh(new THREE.SphereGeometry(2.3,7,7),
      new THREE.MeshLambertMaterial({color:0x3f6b2f}));
    lv.position.set(x,5,z);lv.castShadow=true;scene.add(lv);
    world.trees.push({x,z});
  }
  for(let i=0;i<22;i++)spawnLoot((Math.random()-0.5)*S*1.5,(Math.random()-0.5)*S*1.5);
  for(let i=0;i<6;i++)spawnVehicle((Math.random()-0.5)*S,(Math.random()-0.5)*S);

  zoneMesh=new THREE.Mesh(new THREE.CylinderGeometry(S,S,240,48,1,true),
    new THREE.MeshBasicMaterial({color:0x4da6ff,transparent:true,opacity:0.13,side:THREE.BackSide}));
  zoneMesh.position.y=120;scene.add(zoneMesh);
  zone={cx:0,cz:0,radius:S,phase:0,timer:CFG.zoneWait,shrinking:false};
}

/* 땅에 떨어진 진짜 총 모델 */
function spawnLoot(x,z){
  const id=WEAPON_IDS[Math.floor(Math.random()*WEAPON_IDS.length)];
  const w=WEAPONS[id];
  let mesh=cloneModel(w.model);
  if(mesh){
    mesh.scale.multiplyScalar(1.3); // 바닥에선 약간 크게
  }else{
    mesh=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.35,0.35),
      new THREE.MeshLambertMaterial({color:0x886600}));
  }
  mesh.position.set(x,0.7,z);
  mesh.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  scene.add(mesh);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.12,3,6),
    new THREE.MeshBasicMaterial({color:0xffce5c,transparent:true,opacity:0.4}));
  beam.position.set(x,2,z);scene.add(beam);
  world.loot.push({mesh,beam,x,z,id});
}

/* 차량: C4(사이버트럭) 모델 사용 */
function spawnVehicle(x,z){
  let mesh=cloneModel("c4");
  if(mesh){
    mesh.traverse(o=>{if(o.isMesh){o.castShadow=true;}});
  }else{
    mesh=new THREE.Group();
    const ch=new THREE.Mesh(new THREE.BoxGeometry(4,1.4,2),
      new THREE.MeshLambertMaterial({color:0x9aa}));
    ch.position.y=1;mesh.add(ch);
  }
  mesh.position.set(x,0,z);scene.add(mesh);
  world.vehicles.push({mesh,x,z,yaw:0});
}

/* ---------- 플레이어 / 봇 ---------- */
function spawnPlayer(){
  giveWeapon(WEAPON_IDS[Math.floor(Math.random()*WEAPON_IDS.length)]);
  P.pos.set((Math.random()-0.5)*40,1.7,(Math.random()-0.5)*40);
  P.hp=CFG.maxHealth;
  equipHeldModel();
}
function spawnBots(n){
  const S=CFG.mapSize;
  for(let i=0;i<n;i++){
    const g=new THREE.Group();
    const body=new THREE.Mesh(new THREE.CylinderGeometry(0.4,0.4,1.5,8),
      new THREE.MeshLambertMaterial({color:0x3a5a78}));
    body.position.y=1;body.castShadow=true;g.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(0.34,8,8),
      new THREE.MeshLambertMaterial({color:0xd9a066}));
    head.position.y=2;g.add(head);
    const x=(Math.random()-0.5)*S*1.6,z=(Math.random()-0.5)*S*1.6;
    g.position.set(x,0,z);scene.add(g);
    bots.push({mesh:g,hp:100,alive:true,x,z,target:new THREE.Vector3(x,0,z),
      retarget:0,nextFire:0,weapon:WEAPONS[WEAPON_IDS[Math.floor(Math.random()*WEAPON_IDS.length)]],
      name:"적_"+(i+1)});
  }
}

/* ---------- 무기 ---------- */
function giveWeapon(id){
  let slot=P.weapons.indexOf(null);
  if(slot===-1)slot=P.slot;
  P.weapons[slot]=id;P.ammo[slot]=WEAPONS[id].mag;P.slot=slot;
  equipHeldModel();updateHUD();
}
function switchWeapon(slot){
  if(P.weapons[slot]){P.slot=slot;P.reloading=false;equipHeldModel();updateHUD();}
}
function curWeapon(){return P.weapons[P.slot]?WEAPONS[P.weapons[P.slot]]:null;}

/* 손에 든 총 모델을 카메라 앞에 붙임 */
function equipHeldModel(){
  if(P.heldModel){camera.remove(P.heldModel);P.heldModel=null;}
  const w=curWeapon();if(!w)return;
  const m=cloneModel(w.model);if(!m)return;
  m.scale.multiplyScalar(0.9);
  m.position.set(0.35,-0.3,-0.7); // 화면 우하단(1인칭 총 위치)
  m.rotation.y=Math.PI;
  camera.add(m);P.heldModel=m;
  if(!scene.children.includes(camera))scene.add(camera);
}

/* ---------- 게임 루프 ---------- */
function animate(){
  if(state!=='playing')return;
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),0.05);
  readInput();updatePlayer(dt);updateZone(dt);updateBots(dt);
  updateTracers(dt);spinLoot(dt);updateCamera();updateHUD();drawMinimap();
  renderer.render(scene,camera);
}
function readInput(){
  if(!isMobile){
    let mx=0,my=0;
    if(keys['KeyW'])my+=1;if(keys['KeyS'])my-=1;
    if(keys['KeyA'])mx-=1;if(keys['KeyD'])mx+=1;
    input.moveX=mx;input.moveY=my;
    input.run=keys['ShiftLeft']||keys['ShiftRight'];
  }
}

/* ---------- 이동/사격 ---------- */
function updatePlayer(dt){
  if(P.inVehicle){driveVehicle(dt);handleShoot();return;}
  const st=STANCE[P.stance];
  let speed=(input.run&&P.stance==='stand')?CFG.runSpeed:CFG.walkSpeed;
  speed*=st.speed;
  if(P.aiming)speed*=0.5;

  const fwd=new THREE.Vector3(Math.sin(P.yaw),0,Math.cos(P.yaw));
  const right=new THREE.Vector3(Math.cos(P.yaw),0,-Math.sin(P.yaw));
  const move=new THREE.Vector3();
  move.addScaledVector(fwd,input.moveY).addScaledVector(right,input.moveX);
  if(move.length()>0)move.normalize();
  P.vel.x=move.x*speed;P.vel.z=move.z*speed;

  if(P.onGround&&input.jump&&P.stance==='stand'){P.vel.y=CFG.jumpForce;P.onGround=false;}
  input.jump=false;
  P.vel.y+=CFG.gravity*dt;

  let nx=P.pos.x+P.vel.x*dt,nz=P.pos.z+P.vel.z*dt;
  if(!hitsBuilding(nx,P.pos.z))P.pos.x=nx;
  if(!hitsBuilding(P.pos.x,nz))P.pos.z=nz;
  const groundH=st.h;
  P.pos.y+=P.vel.y*dt;
  if(P.pos.y<=groundH){P.pos.y=groundH;P.vel.y=0;P.onGround=true;}

  const lim=CFG.mapSize*1.05;
  P.pos.x=Math.max(-lim,Math.min(lim,P.pos.x));
  P.pos.z=Math.max(-lim,Math.min(lim,P.pos.z));

  handleShoot();

  if(input.reload){const w=curWeapon();
    if(w&&!P.reloading&&P.ammo[P.slot]<w.mag){P.reloading=true;P.reloadEnd=performance.now()+w.reload*1000;}
    input.reload=false;}
  const w=curWeapon();
  if(P.reloading&&w&&performance.now()>=P.reloadEnd){P.ammo[P.slot]=w.mag;P.reloading=false;}

  // 줍기 힌트
  const near=nearestLoot();
  const hint=document.getElementById('pickHint');
  if(near){hint.classList.add('show');document.getElementById('pickName').textContent=WEAPONS[near.id].name;}
  else hint.classList.remove('show');
  if(input.pick){tryPickup();input.pick=false;}
}
function handleShoot(){
  const w=curWeapon();
  if(w&&input.fire&&!P.reloading&&performance.now()>=P.nextFire&&P.ammo[P.slot]>0){
    fireWeapon(w);if(w.mode==='single')input.fire=false;
  }
}
function hitsBuilding(x,z){
  for(const b of world.buildings)
    if(Math.abs(x-b.x)<b.w/2+0.5&&Math.abs(z-b.z)<b.d/2+0.5)return true;
  return false;
}

function fireWeapon(w){
  P.nextFire=performance.now()+60000/w.rpm;
  P.ammo[P.slot]--;
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const spr=(P.aiming?w.spread*0.4:w.spread)*0.01;
  dir.x+=(Math.random()-0.5)*spr;dir.y+=(Math.random()-0.5)*spr;dir.z+=(Math.random()-0.5)*spr;
  dir.normalize();
  P.pitch+=w.recoil*(P.aiming?0.007:0.012);

  const origin=new THREE.Vector3();camera.getWorldPosition(origin);
  let hit=null,hd=Infinity;
  for(const bot of bots){
    if(!bot.alive)continue;
    const c=new THREE.Vector3(bot.x,1.2,bot.z);
    const d=raySphere(origin,dir,c,0.9);
    if(d!==null&&d<hd&&d<w.range){hd=d;hit=bot;}
  }
  if(hit){
    hit.hp-=w.dmg;
    tracer(origin,new THREE.Vector3(hit.x,1.2,hit.z));
    if(hit.hp<=0)killBot(hit);
  }else{
    tracer(origin,origin.clone().addScaledVector(dir,w.range*0.5));
  }
}
function raySphere(o,d,c,r){
  const oc=o.clone().sub(c);const b=oc.dot(d);const cc=oc.dot(oc)-r*r;
  const disc=b*b-cc;if(disc<0)return null;const t=-b-Math.sqrt(disc);return t>0?t:null;
}
function tracer(a,b){
  const g=new THREE.BufferGeometry().setFromPoints([a.clone(),b.clone()]);
  const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffdd55}));
  scene.add(l);tracers.push({l,life:0.05});
}
function updateTracers(dt){
  for(let i=tracers.length-1;i>=0;i--){tracers[i].life-=dt;
    if(tracers[i].life<=0){scene.remove(tracers[i].l);tracers.splice(i,1);}}
}
function killBot(b){
  if(!b.alive)return;b.alive=false;scene.remove(b.mesh);
  stats.kills++;stats.alive--;killFeed(P.nick+" ▶ "+b.name);checkWin();
}

/* ---------- 봇 AI ---------- */
function updateBots(dt){
  const origin=new THREE.Vector3();camera.getWorldPosition(origin);
  for(const bot of bots){
    if(!bot.alive)continue;
    bot.retarget-=dt;
    if(bot.retarget<=0){bot.retarget=2+Math.random()*3;
      const a=Math.random()*Math.PI*2,d=Math.random()*zone.radius*0.7;
      bot.target.set(zone.cx+Math.cos(a)*d,0,zone.cz+Math.sin(a)*d);}
    const dp=Math.hypot(P.pos.x-bot.x,P.pos.z-bot.z);
    let tx,tz;if(dp<48){tx=P.pos.x;tz=P.pos.z;}else{tx=bot.target.x;tz=bot.target.z;}
    const dir=new THREE.Vector3(tx-bot.x,0,tz-bot.z);
    if(dir.length()>1){dir.normalize();const sp=6;
      const nx=bot.x+dir.x*sp*dt,nz=bot.z+dir.z*sp*dt;
      if(!hitsBuilding(nx,bot.z))bot.x=nx;if(!hitsBuilding(bot.x,nz))bot.z=nz;}
    bot.mesh.position.set(bot.x,0,bot.z);bot.mesh.lookAt(tx,0,tz);
    const dz=Math.hypot(bot.x-zone.cx,bot.z-zone.cz);
    if(dz>zone.radius){bot.hp-=CFG.zoneDPS*dt;if(bot.hp<=0){killBot(bot);continue;}}
    if(dp<42&&performance.now()>=bot.nextFire){
      bot.nextFire=performance.now()+(700+Math.random()*900);
      const ch=Math.max(0.12,0.6-dp/85);
      if(Math.random()<ch){damagePlayer(bot.weapon.dmg*0.5,bot.name);
        tracer(new THREE.Vector3(bot.x,1.4,bot.z),origin);}
    }
  }
}

/* ---------- 자기장 ---------- */
function updateZone(dt){
  zone.timer-=dt;
  if(!zone.shrinking){
    if(zone.timer<=0&&zone.phase<CFG.zonePhases){
      zone.shrinking=true;zone.startR=zone.radius;zone.startCx=zone.cx;zone.startCz=zone.cz;
      zone.targetR=Math.max(8,zone.radius*0.55);
      const a=Math.random()*Math.PI*2,off=(zone.radius-zone.targetR)*Math.random();
      zone.targetCx=zone.cx+Math.cos(a)*off;zone.targetCz=zone.cz+Math.sin(a)*off;
      zone.timer=CFG.zoneShrink;}
  }else{
    const t=1-Math.max(0,zone.timer/CFG.zoneShrink);
    zone.radius=lerp(zone.startR,zone.targetR,t);
    zone.cx=lerp(zone.startCx,zone.targetCx,t);zone.cz=lerp(zone.startCz,zone.targetCz,t);
    if(zone.timer<=0){zone.shrinking=false;zone.phase++;zone.timer=CFG.zoneWait;}
  }
  zoneMesh.scale.set(zone.radius/CFG.mapSize,1,zone.radius/CFG.mapSize);
  zoneMesh.position.set(zone.cx,120,zone.cz);
  const d=Math.hypot(P.pos.x-zone.cx,P.pos.z-zone.cz);
  const out=d>zone.radius;
  document.getElementById('zoneWarn').classList.toggle('show',out);
  if(out)damagePlayer(CFG.zoneDPS*dt,"자기장");
}
function lerp(a,b,t){return a+(b-a)*t;}

/* ---------- 데미지/죽음 ---------- */
function damagePlayer(amt,by){
  if(state!=='playing')return;
  P.hp-=amt;
  const f=document.getElementById('dmgflash');
  f.style.background='rgba(231,64,46,0.25)';setTimeout(()=>f.style.background='rgba(231,64,46,0)',90);
  const v=document.getElementById('dmgVignette');v.style.opacity='1';setTimeout(()=>v.style.opacity='0',200);
  if(P.hp<=0){P.hp=0;state='dead';stats.alive--;
    if(document.exitPointerLock)document.exitPointerLock();showResult(false,by);}
}

/* ---------- 줍기/차량 ---------- */
function nearestLoot(){
  let best=null,bd=CFG.pickRange;
  for(const l of world.loot){const d=Math.hypot(P.pos.x-l.x,P.pos.z-l.z);if(d<bd){bd=d;best=l;}}
  return best;
}
function tryPickup(){
  const l=nearestLoot();if(!l)return;
  giveWeapon(l.id);scene.remove(l.mesh);scene.remove(l.beam);
  world.loot=world.loot.filter(x=>x!==l);
}
function tryVehicle(){
  if(state!=='playing')return false;
  if(P.inVehicle){P.inVehicle=null;return true;}
  let best=null,bd=CFG.vehicleRange;
  for(const v of world.vehicles){const d=Math.hypot(P.pos.x-v.x,P.pos.z-v.z);if(d<bd){bd=d;best=v;}}
  if(best){P.inVehicle=best;return true;}
  return false;
}
function driveVehicle(dt){
  const v=P.inVehicle;
  v.yaw-=input.moveX*1.5*dt;
  const sp=24*input.moveY;
  v.x+=Math.sin(v.yaw)*sp*dt;v.z+=Math.cos(v.yaw)*sp*dt;
  v.mesh.position.set(v.x,0,v.z);v.mesh.rotation.y=v.yaw;
  P.pos.x=v.x;P.pos.z=v.z;P.pos.y=2.6;P.yaw=v.yaw;
}

/* ---------- 카메라 (배그식 3인칭/1인칭) ---------- */
function updateCamera(){
  const eye=new THREE.Vector3(P.pos.x,P.pos.y,P.pos.z);
  const dir=new THREE.Vector3(
    Math.sin(P.yaw)*Math.cos(P.pitch),Math.sin(P.pitch),Math.cos(P.yaw)*Math.cos(P.pitch));
  if(P.tpp&&!P.aiming&&!P.inVehicle){
    // 3인칭: 캐릭터 뒤 위쪽에서
    const back=4.5,up=1.2;
    camera.position.set(eye.x-dir.x*back,eye.y+up,eye.z-dir.z*back);
    camera.lookAt(eye.x+dir.x*5,eye.y+dir.y*5,eye.z+dir.z*5);
    if(P.heldModel)P.heldModel.visible=false;
  }else{
    // 1인칭(조준/차량/V토글)
    camera.position.copy(eye);
    camera.lookAt(eye.clone().add(dir));
    if(P.heldModel)P.heldModel.visible=true;
  }
  // 조준 시 시야각 줌
  const fov=P.aiming?50:72;
  camera.fov+=(fov-camera.fov)*0.2;camera.updateProjectionMatrix();
}

/* ---------- HUD/미니맵 ---------- */
function updateHUD(){
  const w=curWeapon();
  document.getElementById('hpbar').style.width=(P.hp/CFG.maxHealth*100)+'%';
  document.getElementById('hpNum').textContent=Math.ceil(P.hp);
  document.getElementById('ammoNow').textContent=w?P.ammo[P.slot]:0;
  document.getElementById('ammoMag').textContent=w?w.mag:0;
  document.getElementById('aliveNum').textContent=Math.max(1,stats.alive);
  document.getElementById('phaseInfo').textContent=
    zone.shrinking?"자기장 축소중":"자기장 "+Math.ceil(zone.timer)+"s";
  for(let i=0;i<2;i++){
    const el=document.getElementById('slot'+i);
    el.querySelector('.n').textContent=P.weapons[i]?WEAPONS[P.weapons[i]].name:'-';
    el.classList.toggle('active',i===P.slot);
  }
  // 조준 시 십자선 좁히기
  document.getElementById('crosshair').style.transform=
    `translate(-50%,-50%) scale(${P.aiming?0.5:1})`;
}
function killFeed(t){
  const f=document.getElementById('killfeed');
  const d=document.createElement('div');d.textContent="💀 "+t;f.prepend(d);
  setTimeout(()=>d.remove(),4000);if(f.children.length>4)f.lastChild.remove();
}
function drawMinimap(){
  const c=document.getElementById('minimap'),x=c.getContext('2d');
  const S=CFG.mapSize,W=c.width,sc=W/(S*2);
  x.clearRect(0,0,W,W);x.fillStyle='rgba(40,55,38,.6)';x.fillRect(0,0,W,W);
  const tx=v=>W/2+v*sc,tz=v=>W/2+v*sc;
  x.strokeStyle='#4da6ff';x.lineWidth=2;x.beginPath();
  x.arc(tx(zone.cx),tz(zone.cz),zone.radius*sc,0,7);x.stroke();
  x.fillStyle='#e7402e';
  for(const b of bots)if(b.alive)x.fillRect(tx(b.x)-1.5,tz(b.z)-1.5,3,3);
  // 플레이어(방향표시)
  x.save();x.translate(tx(P.pos.x),tz(P.pos.z));x.rotate(-P.yaw);
  x.fillStyle='#f2a900';x.beginPath();x.moveTo(0,-5);x.lineTo(3.5,4);x.lineTo(-3.5,4);x.fill();x.restore();
}
function spinLoot(dt){for(const l of world.loot)l.mesh.rotation.y+=dt*1.5;}

/* ---------- 승리/결과 ---------- */
function checkWin(){
  if(stats.alive<=1&&state==='playing'){state='win';
    if(document.exitPointerLock)document.exitPointerLock();showResult(true);}
}
function showResult(win,by){
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('touch').classList.add('hidden');
  const r=document.getElementById('result'),t=document.getElementById('resTitle');
  r.classList.remove('hidden');
  t.textContent=win?"WINNER WINNER\n치킨이닭!":"패배";
  t.className="res-title "+(win?"res-win":"res-lose");
  document.getElementById('resStat').innerHTML=
    `킬 <span>${stats.kills}</span> · 순위 <span>#${Math.max(1,stats.alive+(win?0:1))}</span>`
    +(by&&!win?`<br><span style="font-size:15px">${by}에게 사망</span>`:"");
}

/* ---------- 모바일 터치 ---------- */
(function(){
  const joy=document.getElementById('joy'),stick=document.getElementById('joyStick');
  let joyId=null,jx=0,jy=0,lookId=null,lx=0,ly=0;
  joy.addEventListener('touchstart',e=>{const t=e.changedTouches[0];joyId=t.identifier;
    const r=joy.getBoundingClientRect();jx=r.left+r.width/2;jy=r.top+r.height/2;e.preventDefault();},{passive:false});
  document.addEventListener('touchstart',e=>{for(const t of e.changedTouches){
    if(t.clientX>innerWidth*0.5&&lookId===null&&!t.target.classList.contains('tb')){
      lookId=t.identifier;lx=t.clientX;ly=t.clientY;}}});
  document.addEventListener('touchmove',e=>{for(const t of e.changedTouches){
    if(t.identifier===joyId){let dx=t.clientX-jx,dy=t.clientY-jy;const mx=52,len=Math.hypot(dx,dy);
      if(len>mx){dx*=mx/len;dy*=mx/len;}stick.style.transform=`translate(${dx-26}px,${dy-26}px)`;
      input.moveX=dx/mx;input.moveY=-dy/mx;}
    if(t.identifier===lookId){const s=P.aiming?0.004:0.006;
      P.yaw-=(t.clientX-lx)*s;P.pitch-=(t.clientY-ly)*s;
      P.pitch=Math.max(-1.3,Math.min(1.3,P.pitch));lx=t.clientX;ly=t.clientY;}}
    e.preventDefault();},{passive:false});
  document.addEventListener('touchend',e=>{for(const t of e.changedTouches){
    if(t.identifier===joyId){joyId=null;input.moveX=0;input.moveY=0;stick.style.transform='translate(-50%,-50%)';}
    if(t.identifier===lookId)lookId=null;}});
  const bind=(id,dn,up)=>{const el=document.getElementById(id);
    el.addEventListener('touchstart',e=>{dn();e.stopPropagation();e.preventDefault();},{passive:false});
    if(up)el.addEventListener('touchend',e=>{up();e.preventDefault();},{passive:false});};
  bind('tFire',()=>input.fire=true,()=>input.fire=false);
  bind('tAim',()=>P.aiming=!P.aiming);
  bind('tJump',()=>input.jump=true);
  bind('tReload',()=>input.reload=true);
  bind('tPick',()=>{if(!tryVehicle())input.pick=true;});
  bind('tStance',()=>toggleStance('crouch'));
})();

/* ===== PROJECT MANIFEST =====
================================================================
  배틀플레이스 (Battle Place) — PROJECT MANIFEST
  최종 업데이트: 2026-06-02 / 버전: WEB v2.0 (진짜 모델 + 배그 조작)
================================================================

[1] 내가 요청한 것
- 배그 스타일 배틀로얄 "배틀플레이스"
- ★ 유니티 안 씀, 웹(브라우저)으로
- ★ 내가 준 진짜 3D 모델을 제대로 사용 (파일 따로 올려도 됨)
- ★ 조작법을 배틀그라운드처럼
- 핵심: 이동 / 사격 판정 / 자기장 / 파밍 / 총기 능력치

[2] 완료 목록
[O] 업로드 모델 → 웹용 GLB 변환 (총6종 + 차량1종, 텍스처 포함)
    M4A1, M4A1-S, MP5K, KSR-29, AWP 드래곤로어, SS-55, C4(사이버트럭)
[O] GLTFLoader로 진짜 모델 로딩 (로딩바 표시)
[O] 손에 든 총 모델이 화면에 보임 + 바닥 파밍도 진짜 모델
[O] 차량도 진짜 C4 모델로 운전
[O] 배그식 조작:
    - 기본 3인칭(TPP), 우클릭 조준 시 1인칭+줌(ADS)
    - 자세: 서기(기본)/앉기 C/엎드리기 Z (속도·은신 차이)
    - V키 시점전환, 무기 1·2번 슬롯
    - 달리기 Shift, 줍기/차량 F
[O] 히트스캔 사격 + 조준 시 정확도↑/반동↓
[O] 자기장 6단계 축소 + 데미지 + 경고
[O] 봇 AI(추적/사격/자기장 회피) → 혼자서도 배틀로얄
[O] 배그식 HUD: 상단 생존수, 미니맵(방향표시), 무기슬롯,
    체력바+자세, 킬피드, 줍기힌트, 피격 화면효과
[O] 결과화면(치킨이닭!/패배+순위)
[O] 모바일 터치 풀세트 (조이스틱/조준/자세/줍기 버튼)
[O] 검증: JS문법OK, 중괄호균형, DOM ID 매칭, GLB 표준 확인, 서버서빙 OK

[3] 미완료 목록
[ ] 진짜 멀티플레이 (Firebase) — 현재는 봇전
[ ] 비행기 낙하 진입 연출
[ ] 캐릭터 모델 (모델팩에 사람 없음 → Mixamo 등 필요)
[ ] 회복아이템/방어구/탄약보급
[ ] 사운드(발사음/피격음)
[ ] City Islands 맵 적용 (지금은 코드 생성 맵, 원하면 교체 가능)
[ ] 진짜 .apk (Capacitor로 감싸기)
[ ] 너무 무거운 모델(Rifle 40만정점) 최적화 후 추가

[4] 더 필요한 것
- 캐릭터 모델 + 애니메이션 붙이면 3인칭 완성도↑
- 사운드 넣으면 몰입감 크게 상승
- 모바일은 모델 많으면 무거우니 LOD/간소화 고려
- 멀티플레이는 Firebase Realtime DB 위치동기화부터

[5] 이어서 만들기용 프롬프트 (다른 AI에게 복사용)
"""
브라우저 배틀로얄 '배틀플레이스'를 만들고 있어. 유니티 안 쓰고
index.html + game.js + models/(GLB) 구조. Three.js(r128)+GLTFLoader 사용.
GitHub Pages 배포.

[이미 된 것]
- 진짜 총기6종+차량1종 GLB 로딩(손에 든 총/바닥 파밍/차량 다 진짜 모델)
- 배그 조작: 3인칭 기본, 우클릭 조준(1인칭+줌), 자세 C/Z, V 시점전환,
  무기 1·2슬롯, 달리기 Shift, 줍기/차량 F
- 히트스캔 사격, 자기장 6단계, 봇 AI, 배그식 HUD, 미니맵, 모바일 터치
- 코드구조: WEAPONS(총능력치), CFG(설정), STANCE(자세), P(플레이어상태),
  glbModels(로딩된 모델), animate() 루프

[다음에 해줘] (골라서)
- Firebase 멀티플레이(위치 동기화)
- 비행기 낙하 진입
- 캐릭터 모델+애니메이션(Mixamo)
- 사운드 / City Islands 맵 적용 / 회복아이템

models 폴더 구조 유지하고, 결과물 끝에 이 manifest 업데이트해서 붙여줘.
설명은 초등학교 1학년도 이해하게 쉽게.
"""
================================================================
*/
