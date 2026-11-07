local HttpService = game:GetService("HttpService")
local MessagingService = game:GetService("MessagingService")

local Config = require(script.Config)
local ApiClient = require(script.ApiClient)
local HardwareDriver = require(script.HardwareDriver)
local InstanceRegistry = require(script.InstanceRegistry)

local sessionId = game.JobId
if sessionId == "" then
	sessionId = "studio-" .. string.gsub(HttpService:GenerateGUID(false), "[{}]", "")
end
local placeId = tostring(game.PlaceId)
local universeId = tostring(game.GameId)
print(string.format(
	"[JOP] Bridge boot: backend=%s universe=%s place=%s session=%s topic=%s",
	Config.BackendBaseUrl, universeId, placeId, sessionId, Config.MessagingTopic
))
local api = ApiClient.new(Config)
local updateFetchInProgress = false
local updateFetchRequested = false
local registry
local bridgeDisabled = false
local isRegistered = false
local currentUpdateCursor = 0
local occupationFlushScheduled = false
local switchFeedbackFlushScheduled = false
local occupationFlushInProgress = false
local switchFeedbackFlushInProgress = false
local REPORT_FLUSH_DELAY_SECONDS = 0.25
-- The backend's liveness timeout is 60 seconds. Leave room for request retries.
local HEARTBEAT_INTERVAL_SECONDS = 20
local UPDATE_POLL_INTERVAL_SECONDS = 10
local pendingOccupationReports = {}
local pendingOccupationOrder = {}
local pendingSwitchFeedbackReports = {}
local pendingSwitchFeedbackOrder = {}

local function newEventId()
	return HttpService:GenerateGUID(false)
end

local function occupationReportKey(link, report)
	return table.concat({
		link.stationId,
		link.pieceId,
		report.traversalState or "",
	}, "\0")
end

local function switchFeedbackReportKey(link, report)
	return table.concat({
		link.stationId,
		link.pieceId,
		report.controlSlot or "",
	}, "\0")
end

local function queueUniqueReport(store, order, key, payload)
	if store[key] == nil then
		table.insert(order, key)
	end
	store[key] = payload
end

local function hasPendingReports(order)
	return #order > 0
end

local function popAllReports(store, order)
	local reports = {}

	for _, key in ipairs(order) do
		local payload = store[key]
		if payload ~= nil then
			table.insert(reports, payload)
			store[key] = nil
		end
	end

	return reports, {}
end

local function flushOccupationReports()
	occupationFlushScheduled = false
	if occupationFlushInProgress then
		return
	end
	if not isRegistered or bridgeDisabled then
		return
	end

	if not hasPendingReports(pendingOccupationOrder) then
		return
	end

	local batch
	batch, pendingOccupationOrder = popAllReports(
		pendingOccupationReports,
		pendingOccupationOrder
	)

	if #batch == 0 then
		return
	end
	occupationFlushInProgress = true

	local success, err = pcall(function()
		api:ReportOccupationBatch(sessionId, batch)
	end)
	if not success then
		warn(
			string.format(
				"[JOP] Failed to report occupation batch (%d events): %s",
				#batch,
				tostring(err)
			)
		)

		for _, payload in ipairs(batch) do
			local key = table.concat({
				payload.stationId,
				payload.pieceId,
				payload.traversalState or "",
			}, "\0")
			-- A newer sensor transition may have arrived while HTTP was in flight.
			if pendingOccupationReports[key] == nil then
				queueUniqueReport(pendingOccupationReports, pendingOccupationOrder, key, payload)
			end
		end

		if not occupationFlushScheduled then
			occupationFlushScheduled = true
			task.delay(1, flushOccupationReports)
		end
	end
	occupationFlushInProgress = false
	if hasPendingReports(pendingOccupationOrder) and not occupationFlushScheduled then
		occupationFlushScheduled = true
		task.delay(REPORT_FLUSH_DELAY_SECONDS, flushOccupationReports)
	end
end

local function flushSwitchFeedbackReports()
	switchFeedbackFlushScheduled = false
	if switchFeedbackFlushInProgress then
		return
	end
	if not isRegistered or bridgeDisabled then
		return
	end

	if not hasPendingReports(pendingSwitchFeedbackOrder) then
		return
	end

	local batch
	batch, pendingSwitchFeedbackOrder = popAllReports(
		pendingSwitchFeedbackReports,
		pendingSwitchFeedbackOrder
	)

	if #batch == 0 then
		return
	end
	switchFeedbackFlushInProgress = true

	local success, err = pcall(function()
		api:ReportSwitchFeedbackBatch(sessionId, batch)
	end)
	if not success then
		warn(
			string.format(
				"[JOP] Failed to report switch feedback batch (%d events): %s",
				#batch,
				tostring(err)
			)
		)

		for _, payload in ipairs(batch) do
			local key = table.concat({
				payload.stationId,
				payload.pieceId,
				payload.controlSlot or "",
			}, "\0")
			if pendingSwitchFeedbackReports[key] == nil then
				queueUniqueReport(pendingSwitchFeedbackReports, pendingSwitchFeedbackOrder, key, payload)
			end
		end

		if not switchFeedbackFlushScheduled then
			switchFeedbackFlushScheduled = true
			task.delay(1, flushSwitchFeedbackReports)
		end
	end
	switchFeedbackFlushInProgress = false
	if hasPendingReports(pendingSwitchFeedbackOrder) and not switchFeedbackFlushScheduled then
		switchFeedbackFlushScheduled = true
		task.delay(REPORT_FLUSH_DELAY_SECONDS, flushSwitchFeedbackReports)
	end
end

local function scheduleOccupationFlush()
	if occupationFlushScheduled or not isRegistered or bridgeDisabled then
		return
	end

	occupationFlushScheduled = true
	task.delay(REPORT_FLUSH_DELAY_SECONDS, flushOccupationReports)
end

local function scheduleSwitchFeedbackFlush()
	if switchFeedbackFlushScheduled or not isRegistered or bridgeDisabled then
		return
	end

	switchFeedbackFlushScheduled = true
	task.delay(REPORT_FLUSH_DELAY_SECONDS, flushSwitchFeedbackReports)
end

registry = InstanceRegistry.new(
	Config,
	HardwareDriver,
	function(link, report)
		local payload = {
			eventId = newEventId(),
			stationId = link.stationId,
			pieceId = link.pieceId,
			traversalState = report.traversalState,
			occupied = report.occupied,
			observedAt = DateTime.now():ToIsoDate(),
		}
		queueUniqueReport(
			pendingOccupationReports,
			pendingOccupationOrder,
			occupationReportKey(link, report),
			payload
		)
		scheduleOccupationFlush()
	end,
	function(link, report)
		local payload = {
			eventId = newEventId(),
			stationId = link.stationId,
			pieceId = link.pieceId,
			controlSlot = report.controlSlot,
			position = report.position,
			observedAt = DateTime.now():ToIsoDate(),
		}
		queueUniqueReport(
			pendingSwitchFeedbackReports,
			pendingSwitchFeedbackOrder,
			switchFeedbackReportKey(link, report),
			payload
		)
		scheduleSwitchFeedbackFlush()
	end
)
registry:Start()
registry:DebugPrintLinks()

local function applyInit(initPayload)
	assert(type(initPayload) == "table" and type(initPayload.snapshot) == "table",
		"[JOP] Registration returned no initialization snapshot.")
	assert(initPayload.snapshot.protocolVersion == 1, "[JOP] Unsupported backend snapshot protocol. Update the bridge scripts.")

	if initPayload.snapshot then
		print(
			string.format(
				"[JOP][Main] Applying init snapshot cursor=%s generatedAt=%s",
				tostring(initPayload.cursor),
				tostring(initPayload.snapshot.generatedAt)
			)
		)
		registry:ApplySnapshot(initPayload.snapshot)
	end

	if type(initPayload.cursor) == "number" then
		currentUpdateCursor = initPayload.cursor
	end
end

local function applyUpdates(updateBatch)
	assert(type(updateBatch) == "table" and type(updateBatch.updates) == "table"
		and type(updateBatch.cursor) == "number", "[JOP] Invalid backend update batch.")
	if #updateBatch.updates == 0 then
		currentUpdateCursor = updateBatch.cursor
		return
	end

	print(
		string.format(
			"[JOP][Main] Applying queued update batch cursor=%s generatedAt=%s count=%d",
			tostring(updateBatch.cursor),
			tostring(updateBatch.generatedAt),
			type(updateBatch.updates) == "table" and #updateBatch.updates or 0
		)
	)
	registry:ApplyUpdates(updateBatch)
	if type(updateBatch.cursor) == "number" then
		currentUpdateCursor = updateBatch.cursor
	end
end

local function shouldDisableAfterRegistrationFailure(message)
	if type(message) ~= "string" then
		return false
	end

	return string.find(message, "No Roblox map template is configured for ", 1, true) ~= nil
end

local function disableBridge(reason)
	if bridgeDisabled then
		return
	end

	bridgeDisabled = true
	warn("[JOP] Bridge disabled: " .. tostring(reason))
end

local function fetchQueuedUpdates()
	if bridgeDisabled then
		return
	end

	if not isRegistered then
		return
	end

	if updateFetchInProgress then
		updateFetchRequested = true
		return
	end

	updateFetchInProgress = true
	repeat
		updateFetchRequested = false
		local success, response = pcall(function()
			local updates = api:FetchUpdates(sessionId, currentUpdateCursor)
			applyUpdates(updates)
		end)
		if not success then
			warn("[JOP] Queued update fetch failed: " .. tostring(response))
		end
	until not updateFetchRequested
	updateFetchInProgress = false
end

local function heartbeatLoop()
	local confirmed = false
	while not bridgeDisabled do
		if isRegistered then
			local success, response = pcall(function()
				return api:Heartbeat(sessionId)
			end)
			if not success then
				warn("[JOP] Heartbeat failed: " .. tostring(response))
			elseif not confirmed then
				confirmed = true
				print(string.format("[JOP] Heartbeat confirmed by %s for session %s", Config.BackendBaseUrl, sessionId))
			end
		end

		task.wait(HEARTBEAT_INTERVAL_SECONDS)
	end
end

local subscribed, subscribeResult = pcall(function()
	return MessagingService:SubscribeAsync(Config.MessagingTopic, function(message)
		local decoded = nil
		pcall(function()
			decoded = HttpService:JSONDecode(message.Data)
		end)
		if decoded and decoded.type == "session:changed" and decoded.sessionId == sessionId then
			task.spawn(fetchQueuedUpdates)
		end
	end)
end)
if not subscribed then
	warn("[JOP] MessagingService subscription failed: " .. tostring(subscribeResult))
end

task.spawn(function()
	while true do
		local success, response = pcall(function()
			local init = api:Register(sessionId, universeId, placeId)
			applyInit(init)
		end)
		if success then
			isRegistered = true
			print(
				string.format(
					"[JOP] Registered session %s for PlaceId %s at update cursor %s",
					sessionId,
					placeId,
					tostring(currentUpdateCursor)
				)
			)
			scheduleOccupationFlush()
			scheduleSwitchFeedbackFlush()
			-- Catch changes published between the registration snapshot and becoming ready.
			task.spawn(fetchQueuedUpdates)
			break
		end

		if shouldDisableAfterRegistrationFailure(response) then
			disableBridge(response)
			return
		end

		warn("[JOP] Registration failed; retrying: " .. tostring(response))
		task.wait(10)
	end
end)

task.spawn(heartbeatLoop)

-- MessagingService is a low-latency hint. Recover queued deltas even if a
-- notification is missed or publishing/subscription is temporarily unavailable.
task.spawn(function()
	while not bridgeDisabled do
		task.wait(UPDATE_POLL_INTERVAL_SECONDS)
		fetchQueuedUpdates()
	end
end)
