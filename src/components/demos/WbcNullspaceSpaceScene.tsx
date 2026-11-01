import { useEffect, useRef, useState } from 'react';
import { planarArm } from '../../lib/demos/planarArmMath';

export default function WbcNullspaceSpaceScene({q,projection}:{q:number[];projection:number}){
  const host=useRef<HTMLDivElement>(null),latest=useRef({q,projection});
  const update=useRef<(()=>void)|null>(null);
  const [status,setStatus]=useState('Loading joint-velocity space…');
  latest.current={q,projection};
  useEffect(()=>{update.current?.();},[q,projection]);
  useEffect(()=>{
    let cancelled=false,cleanup=()=>{};
    async function mount(){
      const [T,{OrbitControls}]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);
      if(cancelled)return;
      const container=host.current!;
      const renderer=new T.WebGLRenderer({antialias:true,alpha:true});
      renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.setClearColor(0xffffff,1);
      renderer.domElement.setAttribute('role','img');
      renderer.domElement.setAttribute('aria-label','3D joint-velocity space: posture request projected onto the null-space line perpendicular to the Jacobian row-space plane');
      container.appendChild(renderer.domElement);
      const scene=new T.Scene(),camera=new T.PerspectiveCamera(36,1,.01,30);
      camera.up.set(0,0,1);camera.position.set(3.2,3.4,2.5);
      const controls=new OrbitControls(camera,renderer.domElement);
      controls.target.set(0,0,-.15);controls.enableZoom=false;controls.enablePan=false;controls.update();
      const textures:InstanceType<typeof T.CanvasTexture>[]=[];
      const vec=(v:number[])=>new T.Vector3().fromArray(v);
      const line=(color:number,dashed=false,count=2)=>{
        const geometry=new T.BufferGeometry().setFromPoints(Array.from({length:count},()=>new T.Vector3()));
        const material=dashed?new T.LineDashedMaterial({color,dashSize:.045,gapSize:.025}):new T.LineBasicMaterial({color});
        const object=new T.Line(geometry,material);scene.add(object);return object;
      };
      const label=(text:string,position:number[],color:string)=>{
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
        const ctx=canvas.getContext('2d')!;ctx.font='44px system-ui';ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(text,256,64);
        const texture=new T.CanvasTexture(canvas);textures.push(texture);
        const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false}));sprite.scale.set(.9,.17,1);sprite.position.fromArray(position);sprite.renderOrder=5;scene.add(sprite);return sprite;
      };
      for(let i=0;i<3;i++){
        const axis=line(0xaebbc4),a=[0,0,0],b=[0,0,0];a[i]=-1.3;b[i]=1.3;
        axis.geometry.setFromPoints([vec(a),vec(b)]);
        const p=[0,0,0];p[i]=1.52;label(`q̇${i+1}`,p,'#52646f');
      }
      const plane=new T.Mesh(new T.PlaneGeometry(2.1,2.1),new T.MeshBasicMaterial({color:0x2863b2,transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false}));scene.add(plane);
      const grid=new T.GridHelper(2.1,6,0x8eaed1,0xc6d6e6);
      // GridHelper lies in xz; rotate its normal from y to z before plane alignment.
      grid.geometry.rotateX(Math.PI/2);scene.add(grid);
      const nullLine=line(0x16735e),dropLine=line(0xb74350,true);
      const arrow=(color:number)=>{const a=new T.ArrowHelper(new T.Vector3(0,0,1),new T.Vector3(),1,color,.10,.055);scene.add(a);return a;};
      const rawArrow=arrow(0xb56617),allowedArrow=arrow(0x16735e),removedArrow=arrow(0xb74350),movingArrow=arrow(0xb74350);
      const nullLabel=label('ker J',[0,0,0],'#16735e');
      const rawLabel=label('z',[0,0,0],'#96540f');
      const projectedLabel=label('Nz',[0,0,0],'#16735e');
      const tip=new T.Mesh(new T.SphereGeometry(.035,16,12),new T.MeshBasicMaterial({color:0xb74350}));scene.add(tip);
      const corner=line(0x536670,false,3);
      const render=()=>renderer.render(scene,camera);
      const resize=new ResizeObserver(()=>{renderer.setSize(container.clientWidth,container.clientHeight);camera.aspect=container.clientWidth/container.clientHeight;camera.updateProjectionMatrix();render();});resize.observe(container);
      controls.addEventListener('change',render);
      const setArrow=(a:InstanceType<typeof T.ArrowHelper>,v:InstanceType<typeof T.Vector3>)=>{const length=v.length();a.visible=length>1e-7;if(a.visible){a.setDirection(v.clone().normalize());a.setLength(length,Math.min(.10,length*.3),Math.min(.055,length*.2));}};
      update.current=()=>{
        const {q,projection:p}=latest.current,{n,z,allowed,removed}=planarArm(q);
        const normal=vec(n),raw=vec(z),keep=vec(allowed),drop=vec(removed);
        plane.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);grid.quaternion.copy(plane.quaternion);
        nullLine.geometry.setFromPoints([normal.clone().multiplyScalar(-1.4),normal.clone().multiplyScalar(1.4)]);
        dropLine.geometry.setFromPoints([keep,raw]);dropLine.computeLineDistances();
        setArrow(rawArrow,raw);setArrow(allowedArrow,keep);setArrow(removedArrow,drop);
        const moving=raw.clone().lerp(keep,p);setArrow(movingArrow,moving);tip.position.copy(moving);
        movingArrow.visible=p>0&&p<1;
        nullLabel.position.copy(normal.clone().multiplyScalar(1.25)).add(new T.Vector3(0,0,.12));
        rawLabel.position.copy(raw).add(new T.Vector3(.18,0,-.04));projectedLabel.position.copy(keep).add(new T.Vector3(-.15,0,-.10));
        if(drop.length()>1e-7&&keep.length()>1e-7){const d=drop.clone().normalize().multiplyScalar(.12),k=keep.clone().normalize().multiplyScalar(-.12);corner.geometry.setFromPoints([keep.clone().add(k),keep.clone().add(k).add(d),keep.clone().add(d)]);}
        render();
      };
      update.current();setStatus('');
      cleanup=()=>{update.current=null;resize.disconnect();controls.removeEventListener('change',render);controls.dispose();scene.traverse(object=>{if(object instanceof T.Mesh||object instanceof T.Line||object instanceof T.Sprite){if('geometry' in object)object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach(m=>m.dispose());}});textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
    }
    mount().catch(()=>{if(!cancelled)setStatus('3D view unavailable. The robot comparison and equations remain available.');});
    return()=>{cancelled=true;cleanup();};
  },[]);
  return <div className="wbc-nullspace-space"><div className="wbc-nullspace-surface" ref={host}/>{status&&<span>{status}</span>}</div>;
}
