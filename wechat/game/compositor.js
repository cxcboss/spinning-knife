'use strict';
const {offscreen}=require('./platform');
module.exports=function compositor(gl){
  const sceneProgram=gl.getParameter(gl.CURRENT_PROGRAM);
  function shader(type,source){
    const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));
    return s;
  }
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,
    'attribute vec2 p;uniform vec4 rect;uniform vec2 view,turn;varying vec2 uv;void main(){vec2 q=(p-.5)*rect.zw;vec2 a=rect.xy+rect.zw*.5+vec2(q.x*turn.x-q.y*turn.y,q.x*turn.y+q.y*turn.x);gl_Position=vec4(a/view*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);uv=p;}'));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,
    'precision mediump float;uniform sampler2D image;uniform float opacity;varying vec2 uv;void main(){gl_FragColor=texture2D(image,uv)*opacity;}'));
  gl.bindAttribLocation(program,0,'p');gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  const uniforms={};for(const n of ['rect','view','turn','opacity','image'])uniforms[n]=gl.getUniformLocation(program,n);
  const quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,1,1]),gl.STATIC_DRAW);
  const layers=new Map();
  let clock=0, viewWidth=1,viewHeight=1,surface=null,ctx=null;
  function texture(){
    const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    return tex;
  }
  function upload(cache,src){
    gl.bindTexture(gl.TEXTURE_2D,cache.tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
    const width=src.width,height=src.height;
    if(width>0&&height>0&&cache.pixelWidth===width&&cache.pixelHeight===height){
      gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,src);
    }else{
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
      cache.pixelWidth=width;cache.pixelHeight=height;
    }
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
  }
  function layer(id,version,w,h,density,paint){
    let value=layers.get(id);
    if(!value){value={tex:texture()};layers.set(id,value);}
    value.used=clock;
    if(value.version===version&&value.w===w&&value.h===h&&value.density===density)return value;
    const pw=Math.max(1,Math.ceil(w*density)),ph=Math.max(1,Math.ceil(h*density));
    // JavaScriptCore on iOS keeps canvas backing stores alive. Reuse the same scratch surface.
    if(!surface){surface=offscreen(pw,ph);ctx=surface.getContext('2d');}
    if(surface.width!==pw)surface.width=pw;if(surface.height!==ph)surface.height=ph;
    ctx.setTransform(density,0,0,density,0,0);ctx.clearRect(0,0,w+1,h+1);
    ctx.save();paint(ctx);ctx.restore();
    upload(value,surface);
    Object.assign(value,{version,w,h,density});return value;
  }
  function begin(w,h){
    viewWidth=w;viewHeight=h;
    clock++;gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight);gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindBuffer(gl.ARRAY_BUFFER,quad);
    gl.enableVertexAttribArray(0);for(let i=1;i<4;i++)gl.disableVertexAttribArray(i);
    gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);gl.uniform2f(uniforms.view,w,h);
    gl.uniform1i(uniforms.image,0);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
  }
  function draw(layer,x,y,w,h,alpha=1,angle=0){
    gl.bindTexture(gl.TEXTURE_2D,layer.tex);gl.uniform4f(uniforms.rect,x,y,w,h);
    gl.uniform2f(uniforms.turn,Math.cos(angle),Math.sin(angle));gl.uniform1f(uniforms.opacity,alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function drawClipped(layer,x,y,w,h,clipX,clipY,clipWidth,clipHeight){
    const scaleX=gl.drawingBufferWidth/viewWidth,scaleY=gl.drawingBufferHeight/viewHeight;
    const left=Math.ceil(clipX*scaleX),right=Math.floor((clipX+clipWidth)*scaleX);
    const top=Math.ceil(clipY*scaleY),bottom=Math.floor((clipY+clipHeight)*scaleY);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(left,gl.drawingBufferHeight-bottom,Math.max(0,right-left),Math.max(0,bottom-top));
    draw(layer,x,y,w,h);
    gl.disable(gl.SCISSOR_TEST);
  }
  function end(){
    gl.disable(gl.BLEND);gl.depthMask(true);gl.useProgram(sceneProgram);
    for(let i=1;i<4;i++)gl.enableVertexAttribArray(i);
    if(layers.size>96){for(const [key,value] of layers)if(key.startsWith('text:')&&clock-value.used>60){gl.deleteTexture(value.tex);layers.delete(key);}}
  }
  return {layer,draw,drawClipped,begin,end};
};
