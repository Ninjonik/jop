/** Actual Roblox hardware observer: identities change independently of occupied/clear. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const source = readFileSync('roblox/ServerScriptService/JopBridge/HardwareDriver.lua', 'utf8');
const harness = `
local V={}; V.__index=function(v,k)
  if k=="Magnitude" then return math.sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z) end
  if k=="Unit" then local m=math.sqrt(v.X*v.X+v.Y*v.Y+v.Z*v.Z); return setmetatable({X=v.X/m,Y=v.Y/m,Z=v.Z/m},V) end
  return V[k]
end
local function vec(x,y,z) return setmetatable({X=x,Y=y,Z=z},V) end
function V.__add(a,b) return vec(a.X+b.X,a.Y+b.Y,a.Z+b.Z) end
function V.__sub(a,b) return vec(a.X-b.X,a.Y-b.Y,a.Z-b.Z) end
function V:Dot(b) return self.X*b.X+self.Y*b.Y+self.Z*b.Z end
local function event()
  local callbacks={}
  return {Connect=function(_,fn) callbacks[fn]=true; return {Disconnect=function() callbacks[fn]=nil end} end,
  Fire=function(_,...) for fn in pairs(callbacks) do fn(...) end end}
end
local function part(name,x)
  local p={Name=name,Parent={},Position=vec(x,0,0),Size=vec(1,1,1),CFrame={},Touched=event(),TouchEnded=event(),attributes={}}
  function p:IsA(class) return class=="BasePart" end
  function p:GetAttribute(name) return self.attributes[name] end
  return p
end
local rear,front=part("Occupancy",-2),part("Occupancy",2)
local sensor=part("VehicleSensor",0); sensor.AssemblyLinearVelocity=vec(0,0,0)
local other=part("VehicleSensor",0); other.AssemblyLinearVelocity=vec(1,0,0); other.attributes.JOPVehicleSensorId="second"
local samples={[rear.CFrame]={sensor},[front.CFrame]={sensor}}
local jobs={}
local tasks={spawn=function(fn) table.insert(jobs,coroutine.create(fn)) end,
  wait=function() coroutine.yield() end,delay=function(_,fn) fn() end}
local function poll()
  for _,job in ipairs(jobs) do if coroutine.status(job)~="dead" then local ok,err=coroutine.resume(job); assert(ok,tostring(err)) end end
end
local world={GetPartBoundsInBox=function(_,frame) return samples[frame] or {} end}
local chunk=assert(loadstring([====[${source}]====]))
setfenv(chunk,setmetatable({script={Parent={}},require=function() return {} end,
  game={GetService=function() return {IsCollisionGroupRegistered=function() return true end} end},
  workspace=world,Vector3={new=vec},OverlapParams={new=function() return {} end},
  Enum={RaycastFilterType={Exclude="Exclude"}},typeof=function(v) return type(v)=="table" and "Instance" or type(v) end,
  task=tasks},{__index=getfenv()}))
local hardware=chunk()
local rearReports,frontReports={},{}
local stopRear=hardware.ObserveOccupation({},function(r) table.insert(rearReports,r) end,{occupations={{parts={rear}}}})
local stopFront=hardware.ObserveOccupation({},function(r) table.insert(frontReports,r) end,{occupations={{parts={front}}}})
assert(rearReports[1].occupied and #rearReports[1].vehicles==0)
poll() -- Start the repair loops and wait for the first sampling tick.
sensor.attributes.JOPVehicleSensorId="first"; poll()
assert(rearReports[#rearReports].vehicles[1].sensorId=="first", "Late radio discovery must report identity without an occupied transition")
assert(rearReports[#rearReports].vehicles[1].distanceToFront==nil)
sensor.AssemblyLinearVelocity=vec(1,0,0); poll()
assert(rearReports[#rearReports].vehicles[1].distanceToFront==2)
assert(frontReports[#frontReports].vehicles[1].distanceToFront==-2)
sensor.AssemblyLinearVelocity=vec(0,0,0); local count=#frontReports; poll(); assert(#frontReports==count,"Stops retain direction without unnecessary reports")
sensor.AssemblyLinearVelocity=vec(-1,0,0); poll()
assert(frontReports[#frontReports].vehicles[1].distanceToFront==2,"Reverse travel reverses leading section")
sensor.AssemblyLinearVelocity=vec(0,0,0); sensor.Position=vec(1,0,0); poll()
assert(frontReports[#frontReports].vehicles[1].distanceToFront==-1,"CFrame-driven movement supplies direction when physics velocity is zero")
samples[rear.CFrame]={sensor,other}; poll()
assert(rearReports[#rearReports].occupied and #rearReports[#rearReports].vehicles==2)
samples[rear.CFrame]={other}; poll()
assert(rearReports[#rearReports].occupied and #rearReports[#rearReports].vehicles==1 and rearReports[#rearReports].vehicles[1].sensorId=="second")
samples[front.CFrame]={}; poll()
assert(not frontReports[#frontReports].occupied and #frontReports[#frontReports].vehicles==0)
stopRear(); stopFront(); poll()
print("Actual physical sensors: late identity, forward/reverse direction, stops, shared sections and clear events passed.")
`;
const dir = mkdtempSync(path.join(tmpdir(), 'jop-physical-sensors-'));
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
