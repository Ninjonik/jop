/** Execute the actual radio controller under Luau; no copied state machine. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const source = readFileSync('roblox/ServerScriptService/JopBridge/GsmRController.lua', 'utf8');
const harness = `
local now, jobs = 0, {}
local function event()
  local callbacks = {}
  return { Connect = function(_, callback)
    callbacks[callback] = true
    return { Disconnect = function() callbacks[callback] = nil end }
  end, Fire = function(_, ...)
    for callback in pairs(callbacks) do callback(...) end
  end }
end
local function instance(class, name, parent)
  local obj = { ClassName = class, Name = name, Parent = parent, children = {}, attributes = {},
    Destroying = event(), changed = event() }
  if class == "TextLabel" then obj.Text = "Cislo" end
  if parent then table.insert(parent.children, obj) end
  function obj:IsA(expected) return expected == self.ClassName or expected == "BasePart" and self.ClassName == "MeshPart" end
  function obj:GetChildren() return self.children end
  function obj:GetDescendants()
    local result = {}
    for _, child in ipairs(self.children) do
      table.insert(result, child)
      for _, descendant in ipairs(child:GetDescendants()) do table.insert(result, descendant) end
    end
    return result
  end
  function obj:FindFirstChild(name)
    for _, child in ipairs(self.children) do if child.Name == name then return child end end
  end
  function obj:FindFirstChildOfClass(class)
    for _, child in ipairs(self.children) do if child.ClassName == class then return child end end
  end
  function obj:IsDescendantOf(parent)
    local cursor = self.Parent
    while cursor do if cursor == parent then return true end; cursor = cursor.Parent end
    return false
  end
  function obj:SetAttribute(key, value) self.attributes[key] = value end
  function obj:GetPropertyChangedSignal() return self.changed end
  return obj
end
local workspace = instance("Workspace", "Workspace")
workspace.DescendantAdded = event()
local sensor = instance("MeshPart", "VehicleSensor", workspace)
local playerService = { PlayerRemoving = event() }
local position = setmetatable({}, { __sub = function() return { Magnitude = 0 } end })
local character = instance("Model", "Character")
local root = instance("MeshPart", "HumanoidRootPart", character); root.Position = position
local player = { UserId = 12340, Parent = playerService, Character = character }
local stranger = { UserId = 98765, Parent = playerService, Character = character }
local function radio()
  local model = instance("Model", "RadioStation", workspace)
  local link = instance("ObjectValue", "VehicleSensorLink", model); link.Value = sensor
  local buttons = instance("Model", "Buttons", model)
  for _, name in ipairs({ "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Power", "StarEnter", "End", "Delete", "F", "F3", "F4", "F8", "F9", "F1", "F2" }) do
    local button = instance("MeshPart", name, buttons); button.Position = position
    local detector = instance("ClickDetector", "ClickDetector", button); detector.MouseClick = event()
  end
  local part = instance("MeshPart", "Part", model)
  local gui = instance("SurfaceGui", "SurfaceGui", part)
  for _, name in ipairs({ "StartUp", "Registration_NumberEntering", "Registration_HVselection", "MainScreen" }) do
    local frame = instance("Frame", name, gui)
    local number = instance("Frame", "TrainNumberFrame", frame)
    instance("TextLabel", "TextLabel", number)
    instance("TextLabel", "TrainNumber", number)
    instance("TextLabel", "TrainNumber2", number)
    for _, field in ipairs({ "Registrated", "FunctionCode", "Mode" }) do
      instance("TextLabel", "TextLabel", instance("Frame", field, frame))
    end
    for _, label in ipairs({ "REGISTROVAN_text", "GSMRcountry", "CELEJTE_text", "DeregistrationArrow" }) do instance("TextLabel", label, frame) end
    instance("Frame", "Icons", frame)
  end
  return model
end
local first, second = radio(), radio()
local tasks = {}
function tasks.spawn(fn) table.insert(jobs, { thread = coroutine.create(fn), at = now }) end
function tasks.defer(fn) tasks.spawn(fn) end
function tasks.delay(delay, fn) table.insert(jobs, { thread = coroutine.create(fn), at = now + delay }) end
function tasks.wait(delay) return coroutine.yield(delay) end
local function advance(untilTime)
  while #jobs > 0 do
    table.sort(jobs, function(a, b) return a.at < b.at end)
    if jobs[1].at > untilTime then break end
    local job = table.remove(jobs, 1); now = job.at
    local ok, delay = coroutine.resume(job.thread); assert(ok, tostring(delay))
    if coroutine.status(job.thread) ~= "dead" then job.at = now + delay; table.insert(jobs, job) end
  end
  now = untilTime
end
local stored, registrations, deregistrations, failReply, offline = {}, 0, 0, false, false
local api = {}
function api:GsmR(_, command)
  if offline then return { error = "Offline" } end
  if command and command.type == "initialize" then
    for _, id in ipairs(command.sensorIds) do if not stored[id] then stored[id] = { sensorId = id, revision = 0 } end end
  elseif command and command.type == "register" then
    registrations += 1
    stored[command.sensorId] = { sensorId = command.sensorId, revision = stored[command.sensorId].revision + 1, binding = {
      driverId = command.actorUserId, driverCallsign = command.driverId, trainNumber = command.trainNumber, functionCode = command.functionCode, timetableId = "gvd-1" } }
    if failReply then offline = true; return { error = "Lost reply" } end
    return { vehicle = stored[command.sensorId] }
  elseif command and command.type == "deregister" then
    deregistrations += 1
    stored[command.sensorId] = { sensorId = command.sensorId, revision = stored[command.sensorId].revision + 1 }
    return { vehicle = stored[command.sensorId] }
  end
  local result = {}; for _, vehicle in pairs(stored) do table.insert(result, vehicle) end
  return { vehicles = result }
end
local services = { HttpService = { GenerateGUID = function() return "one-sensor-id" end }, Players = playerService }
local chunk = assert(loadstring([====[${source}]====]))
setfenv(chunk, setmetatable({ game = { GetService = function(_, key) return services[key] end },
  workspace = workspace, task = tasks,
  Instance = { new = function(class, parent) return instance(class, class, parent) end },
  Color3 = { fromRGB = function(r,g,b) return {r,g,b} end },
  UDim2 = { fromScale = function(x,y) return {x,y} end },
  os = { clock = function() return now end },
  warn = function() end }, { __index = getfenv() }))
local controller = chunk()
controller.Start(api, "session", function() return true end)
advance(0)
local function press(model, name, who)
  now += 0.1
  model:FindFirstChild("Buttons"):FindFirstChild(name):FindFirstChildOfClass("ClickDetector").MouseClick:Fire(who or player)
end
local function label(model, frame, field)
  return model:FindFirstChild("Part"):FindFirstChild("SurfaceGui"):FindFirstChild(frame):FindFirstChild(field)
end
local function same()
  assert(first.attributes.JOPGsmRStatus == second.attributes.JOPGsmRStatus)
  for _, a in ipairs(first:FindFirstChild("Part"):FindFirstChild("SurfaceGui"):GetDescendants()) do
    if a:IsA("TextLabel") then
      local b = second:FindFirstChild("Part"):FindFirstChild("SurfaceGui")
      local parts, parent = { a.Name }, a.Parent
      while parent.ClassName ~= "SurfaceGui" do table.insert(parts, 1, parent.Name); parent = parent.Parent end
      for _, name in ipairs(parts) do b = b:FindFirstChild(name) end
      assert(a.Text == b.Text, a.Name .. " differs between cabins")
    end
  end
end
press(first, "Power"); advance(4); same()
press(first, "F2")
assert(label(first, "MainScreen", "REGISTROVAN_text").Text == "Tato funkcia zatial nie je dostupna.")
press(first, "F3")
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").Text == "VOLACI ZNAK\\nRUSNOVODICA")
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").TextWrapped)
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").Size[1] == 0.68)
for _, name in ipairs({ "Zero", "Four", "Two" }) do press(second, name); same() end
assert(label(first, "Registration_NumberEntering", "JOPEntryValue").Text == "042_")
for _, object in ipairs(first:GetDescendants()) do
  if object:IsA("TextLabel") then
    assert(object.BackgroundTransparency == 1, "Unexpected white selection background")
    for index=1,#(object.Text or "") do assert(string.byte(object.Text,index)<128,"Unsupported radio glyph") end
  end
end
press(first, "StarEnter")
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").Text == "CISLO VLAKU")
for _, name in ipairs({ "Five", "Zero", "Zero", "One" }) do press(first, name) end
press(second, "StarEnter"); press(first, "F1"); same()
failReply = true
press(second, "StarEnter")
assert(registrations == 1 and first.attributes.JOPGsmRStatus == "unregistered", "Unconfirmed registration must not display success")
press(first, "F4"); assert(deregistrations == 0, "Unknown outcome must block the opposite command")
offline, failReply = false, false
advance(20); same()
assert(first.attributes.JOPGsmRStatus == "registered")
sensor.attributes.JOPVehicleSensorId = nil
advance(30)
assert(sensor.attributes.JOPVehicleSensorId == first.attributes.JOPVehicleSensorId, "Synchronization must repair the physical sensor identity")
assert(sensor.attributes.JOPGsmRTrainNumber == "5001" and sensor.attributes.JOPGsmRDriverId == "12340")
press(first, "F4", stranger); assert(deregistrations == 0)
press(second, "Power"); assert(first.attributes.JOPGsmRStatus == "registered")
press(second, "F4"); same()
assert(first.attributes.JOPGsmRStatus == "unregistered" and not sensor.attributes.JOPGsmRTrainNumber)
-- Register again, then release both cabins when their driver leaves.
press(first, "F3")
for _, name in ipairs({ "Zero", "Four", "Two" }) do press(first, name) end
press(first, "StarEnter")
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").Text == "CISLO VLAKU")
for _, name in ipairs({ "Five", "Zero", "Zero", "One" }) do press(first, name) end
press(first, "StarEnter"); press(first, "F1"); press(first, "StarEnter")
player.Parent = nil; playerService.PlayerRemoving:Fire(player)
advance(40); same()
assert(first.attributes.JOPGsmRStatus == "unregistered" and deregistrations == 2)
-- Removing the last radio must release its surviving sensor attributes too.
player.Parent = playerService
press(first, "F3")
for _, name in ipairs({ "Zero", "Four", "Two" }) do press(first, name) end
press(first, "StarEnter")
assert(label(first, "Registration_NumberEntering", "JOPEntryPrompt").Text == "CISLO VLAKU")
for _, name in ipairs({ "Five", "Zero", "Zero", "One" }) do press(first, name) end
press(first, "StarEnter"); press(first, "F1"); press(first, "StarEnter")
first.Destroying:Fire(); second.Destroying:Fire()
advance(60)
assert(deregistrations == 3 and not sensor.attributes.JOPGsmRTrainNumber)
print("Actual GSM-R controller: synchronized cabins, keypad, lost replies, ownership and disconnect cleanup passed.")
`;
const directory = mkdtempSync(path.join(tmpdir(), 'jop-gsmr-luau-'));
try {
  const file = path.join(directory, 'verify.luau');
  writeFileSync(file, harness);
  const result = spawnSync(process.argv[2] || 'luau', [file], { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  if (result.status) writeFileSync('/tmp/jop-gsmr-failed.luau', harness);
  process.exitCode = result.status || 0;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
