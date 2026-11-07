/** Execute the actual bridge sources under Luau with deterministic Roblox service doubles. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const luau = process.argv[2] || process.env.LUAU_BIN || 'luau';
const bridge = path.join(process.cwd(), 'roblox/ServerScriptService/JopBridge');
const quote = (source: string) => `[====[${source}]====]`;
const harness = `
local apiSource = ${quote(readFileSync(path.join(bridge, 'ApiClient.lua'), 'utf8'))}
local mainSource = ${quote(readFileSync(path.join(bridge, 'Main.server.lua'), 'utf8'))}

local function load(source, environment)
  local chunk = assert(loadstring(source))
  setfenv(chunk, setmetatable(environment, { __index = getfenv() }))
  return chunk()
end

-- HTTP methods, paths, payloads, retry diagnostics and startup preconditions.
local requests, waits, failures = {}, {}, 0
local http = { HttpEnabled = true }
function http:GetSecret(name)
  assert(name == "JOP_INBOUND_SECRET")
  return { AddPrefix = function(_, prefix) return prefix .. "synthetic-secret" end }
end
function http:JSONEncode(value) return value end
function http:JSONDecode(value) return value end
function http:UrlEncode(value) return value end
function http:RequestAsync(request)
  table.insert(requests, request)
  if failures > 0 then
    failures -= 1
    return { Success = false, StatusCode = 503, Body = "unavailable" }
  end
  return { Success = true, Body = { ok = true } }
end
local config = { BackendBaseUrl = "https://example.test/", RequestAttempts = 2, InboundSecretName = "JOP_INBOUND_SECRET", MessagingTopic = "JOPRuntime" }
local ApiClient = load(apiSource, { game = { GetService = function() return http end }, task = { wait = function(delay) table.insert(waits, delay) end } })
local api = ApiClient.new(config)
api:Register("job", "123", "456")
assert(requests[1].Url == "https://example.test/api/roblox/sessions/register")
assert(requests[1].Method == "POST" and requests[1].Body.serverId == "job" and requests[1].Body.universeId == "123")
api:Heartbeat("job")
assert(requests[2].Url == "https://example.test/api/roblox/sessions/job/heartbeat" and requests[2].Body.serverId == "job")
api:FetchUpdates("job", 7)
assert(requests[3].Method == "GET" and requests[3].Url == "https://example.test/api/roblox/sessions/job/updates?afterSequence=7")
api:ReportOccupationBatch("job", { { occupied = true } })
assert(requests[4].Body.events[1].occupied and string.find(requests[4].Url, "/occupation", 1, true))
api:ReportSwitchFeedbackBatch("job", { { position = "left" } })
assert(requests[5].Body.events[1].position == "left" and string.find(requests[5].Url, "/switch-feedback", 1, true))
failures = 2
local ok, err = pcall(function() api:Heartbeat("job") end)
assert(not ok and string.find(err, "POST https://example.test/api/roblox/sessions/job/heartbeat", 1, true))
assert(not string.find(err, "synthetic-secret", 1, true) and #waits == 1)
http.HttpEnabled = false
assert(not pcall(function() ApiClient.new(config) end))
http.HttpEnabled = true
http.GetSecret = function() error("missing secret") end
ok, err = pcall(function() ApiClient.new(config) end)
assert(not ok and string.find(err, "JOP_INBOUND_SECRET", 1, true))

local function scenario(options)
  local now, jobs, event = 0, {}, 0
  local counts = { register = 0, heartbeat = 0, updates = 0, applied = 0, snapshots = 0 }
  local attempted, logs = {}, {}
  local active, maximum = 0, 0
  local taskMock = {}
  local function enqueue(thread, delay) table.insert(jobs, { thread = thread, at = now + delay }) end
  function taskMock.spawn(callback) enqueue(coroutine.create(callback), 0) end
  function taskMock.delay(delay, callback) enqueue(coroutine.create(callback), delay) end
  function taskMock.wait(delay) return coroutine.yield(delay) end
  local function advance(untilTime)
    local steps = 0
    while #jobs > 0 do
      table.sort(jobs, function(a, b) return a.at < b.at end)
      if jobs[1].at > untilTime then break end
      local job = table.remove(jobs, 1)
      now = job.at
      local success, delay = coroutine.resume(job.thread)
      assert(success, tostring(delay))
      if coroutine.status(job.thread) ~= "dead" then enqueue(job.thread, delay or 0) end
      steps += 1
      assert(steps < 1000, "Scheduler did not settle")
    end
    now = untilTime
  end
  local callbacks = {}
  local registry = {}
  function registry:Start() end
  function registry:DebugPrintLinks() end
  function registry:ApplySnapshot()
    counts.snapshots += 1
    if options.failSnapshot and counts.snapshots == 1 then error("hardware initialization failed") end
  end
  function registry:ApplyUpdates()
    counts.applied += 1
    if options.failApply and counts.applied == 1 then error("hardware update failed") end
  end
  local apiMock = {}
  function apiMock:Register()
    counts.register += 1
    if options.missingTemplate then error("No Roblox map template is configured for UniverseId 123 and PlaceId 456.") end
    return { snapshot = { protocolVersion = 1, stations = {} }, cursor = 0 }
  end
  function apiMock:Heartbeat() counts.heartbeat += 1; return { isLive = true } end
  function apiMock:FetchUpdates(_, cursor)
    counts.updates += 1
    return { updates = { { sequence = cursor + 1 } }, cursor = cursor + 1 }
  end
  local function report(batch)
    table.insert(attempted, batch)
    active += 1; maximum = math.max(maximum, active)
    if options.failBatch and #attempted == 1 then
      taskMock.wait(3)
      active -= 1
      error("temporary report failure")
    end
    active -= 1
  end
  function apiMock:ReportOccupationBatch(_, batch) report(batch) end
  function apiMock:ReportSwitchFeedbackBatch(_, batch) report(batch) end
  local modules = { Config = config, ApiClient = { new = function() return apiMock end }, HardwareDriver = {},
    InstanceRegistry = { new = function(_, _, occupation, feedback) callbacks.occupation = occupation; callbacks.feedback = feedback; return registry end } }
  local services = { HttpService = { GenerateGUID = function() event += 1; return tostring(event) end },
    MessagingService = { SubscribeAsync = function() error("subscription unavailable") end } }
  load(mainSource, { game = { JobId = "job", PlaceId = 456, GameId = 123, GetService = function(_, name) return services[name] end },
    script = { Config = "Config", ApiClient = "ApiClient", HardwareDriver = "HardwareDriver", InstanceRegistry = "InstanceRegistry" },
    require = function(name) return modules[name] end, task = taskMock,
    DateTime = { now = function() return { ToIsoDate = function() return "2026-11-07T00:00:00Z" end } end },
    print = function(message) table.insert(logs, message) end, warn = function(message) table.insert(logs, message) end })
  return { advance = advance, counts = counts, callbacks = callbacks, attempted = attempted, logs = logs, maximum = function() return maximum end }
end

local normal = scenario({ failApply = true })
normal.advance(61)
assert(normal.counts.register == 1 and normal.counts.heartbeat >= 3)
assert(normal.counts.updates >= 6 and normal.counts.applied >= 6, "Missed notifications or apply errors blocked future delta fetches")
local missing = scenario({ missingTemplate = true })
missing.advance(61)
assert(missing.counts.register == 1 and missing.counts.heartbeat == 0 and missing.counts.updates == 0)
local initFailure = scenario({ failSnapshot = true })
initFailure.advance(31)
assert(initFailure.counts.register == 2 and initFailure.counts.heartbeat >= 1, "Snapshot failure silently stopped registration")
for _, channel in ipairs({ "occupation", "feedback" }) do
  local batch = scenario({ failBatch = true })
  batch.advance(0)
  local link = { stationId = "a", pieceId = "piece" }
  local first = channel == "occupation" and { occupied = true } or { controlSlot = "main", position = "left" }
  local newer = channel == "occupation" and { occupied = false } or { controlSlot = "main", position = "right" }
  batch.callbacks[channel](link, first)
  batch.advance(1)
  batch.callbacks[channel](link, newer)
  batch.advance(5)
  assert(batch.maximum() == 1 and #batch.attempted == 2, "Overlapping sensor report batches")
  if channel == "occupation" then assert(batch.attempted[2][1].occupied == false, "Older retry overwrote a newer occupation")
  else assert(batch.attempted[2][1].position == "right", "Older retry overwrote newer switch feedback") end
end
print("Bridge request contracts, heartbeat, missed notifications, initialization recovery and ordered sensor retry checks passed.")
`;

const directory = mkdtempSync(path.join(tmpdir(), 'jop-bridge-test-'));
try {
  const filename = path.join(directory, 'bridge.spec.luau');
  writeFileSync(filename, harness);
  const result = spawnSync(luau, [filename], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
