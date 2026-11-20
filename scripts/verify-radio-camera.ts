/** Execute camera source under Luau: projection geometry and input/lifecycle restoration. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const source = readFileSync(
  'roblox/StarterPlayer/StarterPlayerScripts/JopRadioCameraController.client.lua',
  'utf8',
);
const harness = `
local V = {}; V.__index = function(v,k)
  if k == "Magnitude" then return math.sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z) end
  return V[k]
end
local function vec(x,y,z) return setmetatable({X=x,Y=y,Z=z},V) end
function V.__add(a,b) return vec(a.X+b.X,a.Y+b.Y,a.Z+b.Z) end
function V.__sub(a,b) return vec(a.X-b.X,a.Y-b.Y,a.Z-b.Z) end
function V.__unm(a) return vec(-a.X,-a.Y,-a.Z) end
function V.__mul(a,b) return vec(a.X*b,a.Y*b,a.Z*b) end
function V:Dot(b) return self.X*b.X+self.Y*b.Y+self.Z*b.Z end
function V:Cross(b) return vec(self.Y*b.Z-self.Z*b.Y,self.Z*b.X-self.X*b.Z,self.X*b.Y-self.Y*b.X) end
local function unit(v) return v*(1/v.Magnitude) end
local C = {}; C.__index = C
local function frame(p,r,u,b) return setmetatable({p=p,r=r or vec(1,0,0),u=u or vec(0,1,0),b=b or vec(0,0,1)},C) end
function C:rotate(v) return self.r*v.X+self.u*v.Y+self.b*v.Z end
function C:PointToWorldSpace(v) return self.p+self:rotate(v) end
function C:PointToObjectSpace(v) v=v-self.p; return vec(v:Dot(self.r),v:Dot(self.u),v:Dot(self.b)) end
function C.__mul(a,b) return frame(a:PointToWorldSpace(b.p),a:rotate(b.r),a:rotate(b.u),a:rotate(b.b)) end
local cframe = {new=function(x,y,z) return frame(vec(x or 0,y or 0,z or 0)) end,
  lookAt=function(p,target,up) local b=unit(p-target); local r=unit(up:Cross(b)); return frame(p,r,b:Cross(r),b) end}
local function event()
  local listeners={}
  return {Connect=function(_,fn) table.insert(listeners,fn); return {Disconnect=function() end} end,
    Fire=function(_,...) for _,fn in ipairs(listeners) do fn(...) end end}
end
local function instance(class,name,parent)
  local o={ClassName=class,Name=name,Parent=parent,children={}}
  if parent then table.insert(parent.children,o) end
  function o:IsA(c) return self.ClassName==c or c=="BasePart" and self.ClassName=="MeshPart" end
  function o:FindFirstChild(n) for _,c in ipairs(self.children) do if c.Name==n then return c end end end
  function o:FindFirstChildOfClass(n) for _,c in ipairs(self.children) do if c.ClassName==n then return c end end end
  function o:IsDescendantOf(p) local c=self.Parent; while c do if c==p then return true end; c=c.Parent end; return false end
  function o:GetDescendants() local all={}; for _,c in ipairs(self.children) do table.insert(all,c); for _,d in ipairs(c:GetDescendants()) do table.insert(all,d) end end; return all end
  return o
end
local world=instance("Workspace","Workspace")
local character=instance("Model","Character",world)
local root=instance("MeshPart","HumanoidRootPart",character); root.Position=vec(0,0,-5)
local humanoid=instance("Humanoid","Humanoid",character); humanoid.Health=100
local player={Character=character,CharacterRemoving=event()}
local radio=instance("Model","RadioStation",world)
local display=instance("MeshPart","Part",radio); display.CFrame=cframe.new(); display.Position=vec(0,0,0); display.Size=vec(5,2,.2)
local gui=instance("SurfaceGui","SurfaceGui",display); gui.Face="Front"
local hull=instance("Model","Hull",radio)
local body=instance("MeshPart","Body",hull); body.CFrame=cframe.new(); body.Position=vec(0,0,0); body.Size=vec(10,4,1)
local buttons=instance("Model","Buttons",radio)
local key=instance("MeshPart","One",buttons); key.CFrame=cframe.new(3,0,-.6); key.Size=vec(.5,.5,.3)
local camera={Parent=world,CameraType="Custom",CameraSubject=humanoid,CFrame=cframe.new(0,2,-8),Focus=cframe.new(),FieldOfView=70,FieldOfViewMode="Diagonal",ViewportSize={X=1920,Y=1080},NearPlaneZ=-.5}
function camera:ScreenPointToRay() return {Origin=vec(0,0,-5),Direction=vec(0,0,1)} end
world.CurrentCamera=camera
local target=body
function world:Raycast() return {Instance=target} end
local input={InputBegan=event(),MouseBehavior="LockCenter",MouseIconEnabled=false}
local menu={MenuOpened=event(),MenuIsOpen=false}
local render,actions={},{}
local run={BindToRenderStep=function(_,name,_,fn) render[name]=fn end,UnbindFromRenderStep=function(_,name) render[name]=nil end}
local context={BindActionAtPriority=function(_,name,fn) actions[name]=fn end,UnbindAction=function(_,name) actions[name]=nil end,SetTitle=function() end,SetPosition=function() end}
local normals={Front=vec(0,0,-1),Back=vec(0,0,1),Top=vec(0,1,0),Bottom=vec(0,-1,0),Left=vec(-1,0,0),Right=vec(1,0,0)}
local enum={NormalId={Top="Top",Bottom="Bottom"},CameraType={Scriptable="Scriptable"},FieldOfViewMode={Vertical="Vertical"},MouseBehavior={Default="Default"},UserInputState={Begin="Begin"},ContextActionResult={Sink="Sink"},ContextActionPriority={High={Value=3000}},KeyCode={Escape="Escape",Backspace="Backspace",ButtonB="ButtonB"},RenderPriority={Camera={Value=200}},UserInputType={MouseButton1="MouseButton1",Touch="Touch"},RaycastFilterType={Exclude="Exclude"}}
local services={Players={LocalPlayer=player},RunService=run,UserInputService=input,ContextActionService=context,GuiService=menu,Workspace=world}
local script={Destroying=event()}
local chunk=assert(loadstring([====[${source}]====]))
setfenv(chunk,setmetatable({game={GetService=function(_,name) return services[name] end},Enum=enum,
  Vector3={new=vec,zero=vec(0,0,0),FromNormalId=function(n) return normals[n] end},CFrame=cframe,
  UDim2={new=function(...) return {...} end},RaycastParams={new=function() return {} end},script=script},{__index=getfenv()}))
chunk()
local oldCFrame,oldFocus=camera.CFrame,camera.Focus
local function click(part,processed)
  target=part; input.InputBegan:Fire({UserInputType="MouseButton1",Position={X=100,Y=100}},processed or false)
end
local function fit()
  local maxH,maxV=0,0
  local tv=math.tan(math.rad(camera.FieldOfView)/2); local th=tv*camera.ViewportSize.X/camera.ViewportSize.Y
  for _,p in ipairs(radio:GetDescendants()) do if p:IsA("BasePart") then
    for _,x in ipairs({-1,1}) do for _,y in ipairs({-1,1}) do for _,z in ipairs({-1,1}) do
      local point=camera.CFrame:PointToObjectSpace(p.CFrame:PointToWorldSpace(vec(x*p.Size.X/2,y*p.Size.Y/2,z*p.Size.Z/2)))
      assert(point.Z < -.5,"Near plane clips the radio")
      maxH=math.max(maxH,math.abs(point.X)/(-point.Z*th)); maxV=math.max(maxV,math.abs(point.Y)/(-point.Z*tv))
    end end end
  end end
  assert(maxH <= 1 and maxV <= 1,"A control falls outside the viewport")
  assert(math.max(maxH,maxV) > .97,"Radio should fill the limiting screen dimension")
end
local function restored()
  assert(camera.CameraType=="Custom" and camera.CameraSubject==humanoid)
  assert(camera.CFrame==oldCFrame and camera.Focus==oldFocus and camera.FieldOfView==70 and camera.FieldOfViewMode=="Diagonal")
  assert(input.MouseBehavior=="LockCenter" and not input.MouseIconEnabled)
  assert(not next(render) and not next(actions))
end
click(key); restored()
click(body,true); restored()
click(body); assert(camera.CameraType=="Scriptable"); fit()
assert(input.MouseBehavior=="Default" and input.MouseIconEnabled)
camera.ViewportSize={X=600,Y=1200}; render.JOPRadioCloseUp(); fit()
-- Follow a moving/rotated radio without recalculating its mesh bounds.
local movement=cframe.lookAt(vec(2,1,0),vec(1,1,0),vec(0,1,0))
for _,p in ipairs(radio:GetDescendants()) do if p:IsA("BasePart") then p.CFrame=movement*p.CFrame end end
display.Position=display.CFrame.p
render.JOPRadioCloseUp(); fit()
input.InputBegan:Fire({KeyCode="Backspace"},true); restored()
click(body); menu.MenuOpened:Fire(); restored()
click(body); actions.JOPRadioCloseUpExit(nil,"Begin"); restored()
click(body); root.Position=vec(100,0,0); render.JOPRadioCloseUp(); restored()
root.Position=vec(0,0,-5)
click(body); player.CharacterRemoving:Fire(); restored()
click(body); radio.Parent=nil; render.JOPRadioCloseUp(); restored()
print("Radio camera: full-width/portrait fit, moving radio, keypad exclusion, exit and camera/mouse restoration passed.")
`;
const dir = mkdtempSync(path.join(tmpdir(), 'jop-radio-camera-'));
try {
  const file = path.join(dir, 'verify.luau');
  writeFileSync(file, harness);
  const result = spawnSync(process.argv[2] || 'luau', [file], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  process.exitCode = result.status || 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
