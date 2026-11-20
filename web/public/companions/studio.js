// Local WebGL preview for the three GLBs built by scripts/build-companions.py.
const cast = {
  saebit: { name: '새빛', group: '카시오페이아자리', theme: '하루를 여는 작은 습관', yaw: 0, glow: '#6a527c', description: '날개를 펼치면 다섯 별이 작은 왕관이 돼요. 창가에 아침빛이 들 때면 새빛도 살며시 눈을 떠요.' },
  yunseul: { name: '윤슬', group: '돌고래자리', theme: '나를 돌보는 시간', yaw: .38, glow: '#416a70', description: '물 위로 숨을 쉬러 올라온 윤슬의 등에 햇살이 머물러요. 잠깐 기지개를 켜는 동안 곁에서 천천히 헤엄쳐요.' },
  doran: { name: '도란', group: '거문고자리', theme: '현관 너머 한 걸음', yaw: -.38, glow: '#75566d', description: '도란은 작은 리라가 달린 집을 지고 다녀요. 오늘 문 앞까지만 나가 보고 싶다면, 도란도 딱 거기까지 함께 걸어요.' },
};
const byId = id => document.getElementById(id);
const canvas = document.querySelector('canvas');
const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stars = document.querySelector('.stars');
for (let i = 1; i <= 68; i++) {
  const dot = document.createElement('i');
  const fraction = n => n - Math.floor(n);
  const size = i % 8 === 0 ? 2.4 : 1.2;
  dot.style.cssText = 'width:'+size+'px;height:'+size+'px;left:'+(100*fraction(Math.sin(i*13)*4391))+'%;top:'+(100*fraction(Math.sin(i*73)*871))+'%;opacity:'+(0.24+.55*fraction(i*.618));
  stars.append(dot);
}

const vertex = `attribute vec3 position, normal;
uniform mat4 pose, projection;
varying vec3 N, P;
void main(){
  vec3 a=pose[0].xyz,b=pose[1].xyz,c=pose[2].xyz;
  N=normalize(mat3(cross(b,c),cross(c,a),cross(a,b))*normal);
  P=(pose*vec4(position,1.)).xyz;
  gl_Position=projection*vec4(P,1.);
}`;
const fragment = `precision mediump float;
varying vec3 N,P; uniform vec3 color; uniform float metal;
void main(){
  vec3 n=normalize(N), key=normalize(vec3(-.55,.85,1.0)), view=vec3(0,0,1);
  float diffuse=max(0.,dot(n,key)), hemi=.5+.5*n.y;
  float rim=pow(1.-max(0.,dot(n,view)),3.);
  float shine=pow(max(0.,dot(n,normalize(key+view))),mix(35.,64.,metal));
  vec3 lit=color*(.38+.20*hemi+.62*diffuse)+vec3(.98,.85,.75)*shine*(.10+.38*metal)
    +vec3(.65,.55,.85)*rim*.085;
  gl_FragColor=vec4(pow(max(lit,vec3(0)),vec3(1./2.2)),1.);
}`;

function makeProgram() {
  const p = gl.createProgram();
  for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(p, shader);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  gl.enable(gl.DEPTH_TEST);
  return Object.fromEntries(['position','normal','pose','projection','color','metal'].map(k =>
    [k, ['position','normal'].includes(k) ? gl.getAttribLocation(p,k) : gl.getUniformLocation(p,k)]));
}

function multiply(a,b) {
  const out = new Float32Array(16);
  for (let col=0; col<4; col++) for (let row=0; row<4; row++)
    for (let k=0;k<4;k++) out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
}
function transform(t=[0,0,0], q=[0,0,0,1], s=[1,1,1]) {
  const [x,y,z,w]=q, [a,b,c]=s;
  return [(1-2*(y*y+z*z))*a,2*(x*y+w*z)*a,2*(x*z-w*y)*a,0,
    2*(x*y-w*z)*b,(1-2*(x*x+z*z))*b,2*(y*z+w*x)*b,0,
    2*(x*z+w*y)*c,2*(y*z-w*x)*c,(1-2*(x*x+y*y))*c,0,...t,1];
}

async function loadModel(id) {
  const response = await fetch(id+'.glb');
  if (!response.ok) throw Error('Model unavailable');
  const data=await response.arrayBuffer(), header=new DataView(data), length=header.getUint32(12,true);
  const doc=JSON.parse(new TextDecoder().decode(new Uint8Array(data,20,length)));
  const bin=28+length;
  const arrays=doc.accessors.map(a=>{
    const offset=bin+doc.bufferViews[a.bufferView].byteOffset;
    const Type=a.componentType===5123 ? Uint16Array : Float32Array;
    return new Type(data,offset,a.count*({SCALAR:1,VEC3:3,VEC4:4}[a.type]));
  });
  const buffers=new Map();
  function upload(index, target) {
    if (!buffers.has(index)) {
      const buffer=gl.createBuffer();
      gl.bindBuffer(target,buffer);
      gl.bufferData(target,arrays[index],gl.STATIC_DRAW);
      buffers.set(index,buffer);
    }
    return buffers.get(index);
  }
  const meshes=doc.meshes.map(m=>{
    const p=m.primitives[0], mat=doc.materials[p.material].pbrMetallicRoughness;
    return { position:upload(p.attributes.POSITION,gl.ARRAY_BUFFER), normal:upload(p.attributes.NORMAL,gl.ARRAY_BUFFER),
      indices:upload(p.indices,gl.ELEMENT_ARRAY_BUFFER), count:arrays[p.indices].length, mat };
  });
  const clips=Object.fromEntries(doc.animations.map(anim=>{
    const tracks=anim.channels.map(c=>{
      const s=anim.samplers[c.sampler];
      return { ...c.target, times:arrays[s.input], values:arrays[s.output] };
    });
    return [anim.name,{tracks,duration:Math.max(...tracks.map(t=>t.times[t.times.length-1]))}];
  }));
  return {doc,meshes,clips};
}

const cache=new Map();
let locations, active, model, yaw=0, pitch=.06, frame=0, greeting=0, origin=0;
function schedule() { if (!frame) frame=requestAnimationFrame(draw); }
function draw(now) {
  frame=0;
  if (!model || !locations) return;
  const scale=Math.min(devicePixelRatio,2), w=Math.round(canvas.clientWidth*scale), h=Math.round(canvas.clientHeight*scale);
  if (!w || !h) return;
  if (canvas.width!==w || canvas.height!==h) {canvas.width=w;canvas.height=h;}
  gl.viewport(0,0,w,h);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const horizontal=Math.max(1.95,1.50*w/h), vertical=horizontal*h/w;
  gl.uniformMatrix4fv(locations.projection,false,[1/horizontal,0,0,0,0,1/vertical,0,0,0,0,-.21,0,0,-.045,0,1]);
  const camera=multiply(transform(undefined,[Math.sin(pitch/2),0,0,Math.cos(pitch/2)]),
    transform(undefined,[0,Math.sin(yaw/2),0,Math.cos(yaw/2)]));
  if (greeting && now-greeting>=1000*model.clips.Greeting.duration) greeting=0;
  const clip=greeting ? model.clips.Greeting : model.clips.Idle;
  const t=greeting ? (now-greeting)/1000 : reduced.matches ? 0 : ((now-origin)/1000)%clip.duration;
  const updates=new Map();
  for (const {node,path,times,values} of clip.tracks) {
    let i=0;
    while (i<times.length-2 && times[i+1]<t) i++;
    const amount=Math.min(1,Math.max(0,(t-times[i])/(times[i+1]-times[i])));
    const size=path==='rotation' ? 4 : 3;
    const result=Array.from({length:size},(_,j)=>values[i*size+j]*(1-amount)+values[(i+1)*size+j]*amount);
    if (size===4) { const norm=Math.hypot(...result); for (let k=0;k<4;k++) result[k]/=norm; }
    if (!updates.has(node)) updates.set(node,{});
    updates.get(node)[path]=result;
  }
  function render(index,parent) {
    const node=model.doc.nodes[index], override=updates.get(index);
    const matrix=multiply(parent,transform(override?.translation??node.translation,override?.rotation??node.rotation,node.scale));
    if (node.mesh!==undefined) {
      const mesh=model.meshes[node.mesh];
      gl.uniformMatrix4fv(locations.pose,false,matrix);
      gl.uniform3fv(locations.color,mesh.mat.baseColorFactor.slice(0,3));
      gl.uniform1f(locations.metal,mesh.mat.metallicFactor);
      for (const name of ['position','normal']) {
        gl.bindBuffer(gl.ARRAY_BUFFER,mesh[name]);gl.enableVertexAttribArray(locations[name]);
        gl.vertexAttribPointer(locations[name],3,gl.FLOAT,false,0,0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.indices);
      gl.drawElements(gl.TRIANGLES,mesh.count,gl.UNSIGNED_SHORT,0);
    }
    for (const child of node.children??[]) render(child,matrix);
  }
  render(0,camera);
  if (greeting || !reduced.matches) schedule();
}

async function select(id) {
  active=id;model=null;greeting=0;
  const c=cast[id];yaw=c.yaw;pitch=.06;
  for (const button of document.querySelectorAll('[data-id]')) button.setAttribute('aria-pressed',String(button.dataset.id===id));
  for (const [element,value] of Object.entries({constellation:c.group,theme:c.theme,name:c.name,description:c.description})) byId(element).textContent=value;
  document.querySelector('.sky').style.setProperty('--glow',c.glow);
  canvas.setAttribute('aria-label','3D '+c.name+'. 드래그하거나 방향키로 돌려 보세요.');
  byId('download').href=id+'.glb';
  byId('greet').disabled=true;byId('status').hidden=false;
  try {
    if (!gl) throw Error();
    locations??=makeProgram();
    if (!cache.has(id)) cache.set(id,loadModel(id));
    const loaded=await cache.get(id);
    if (active!==id) return;
    model=loaded;origin=performance.now();
    byId('greet').disabled=false;byId('status').hidden=true;schedule();
  } catch {
    cache.delete(id);
    if (active===id) byId('status').textContent='미리보기를 열 수 없어요. 아래에서 3D 모델을 받아 보세요.';
  }
}

let drag;
canvas.onpointerdown=e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{
  if (!drag) return;
  yaw+=(e.clientX-drag[0])*.011;
  pitch=Math.max(-1.45,Math.min(1.45,pitch+(e.clientY-drag[1])*.010));
  drag=[e.clientX,e.clientY];schedule();
};
canvas.onlostpointercapture=()=>{drag=null;};
canvas.onkeydown=e=>{
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  if (e.key==='ArrowLeft') yaw-=.22;
  if (e.key==='ArrowRight') yaw+=.22;
  if (e.key==='ArrowUp') pitch=Math.max(-1.45,pitch-.18);
  if (e.key==='ArrowDown') pitch=Math.min(1.45,pitch+.18);
  schedule();
};
byId('left').onclick=()=>{yaw-=.45;schedule();};
byId('right').onclick=()=>{yaw+=.45;schedule();};
byId('greet').onclick=()=>{greeting=performance.now();schedule();};
for (const button of document.querySelectorAll('[data-id]')) button.onclick=()=>select(button.dataset.id);
new ResizeObserver(schedule).observe(canvas);
reduced.addEventListener('change',schedule);
select('saebit');
