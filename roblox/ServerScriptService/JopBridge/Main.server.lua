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
local api = ApiClient.new(Config)
local syncInProgress = false
local syncRequested = false
local registry
local bridgeDisabled = false

local function newEventId()
	return HttpService:GenerateGUID(false)
end

registry = InstanceRegistry.new(
	Config,
	HardwareDriver,
	function(link, report)
		task.spawn(function()
			local success, err = pcall(function()
				api:ReportOccupation(sessionId, {
					eventId = newEventId(),
					stationId = link.stationId,
					pieceId = link.pieceId,
					traversalState = report.traversalState,
					occupied = report.occupied,
					observedAt = DateTime.now():ToIsoDate(),
				})
			end)
			if not success then
				warn("[JOP] Failed to report occupation: " .. tostring(err))
			end
		end)
	end,
	function(link, report)
		task.spawn(function()
			local success, err = pcall(function()
				api:ReportSwitchFeedback(sessionId, {
					eventId = newEventId(),
					stationId = link.stationId,
					pieceId = link.pieceId,
					controlSlot = report.controlSlot,
					position = report.position,
					observedAt = DateTime.now():ToIsoDate(),
				})
			end)
			if not success then
				warn("[JOP] Failed to report switch feedback: " .. tostring(err))
			end
		end)
	end
)
registry:Start()

local function applyResponse(response)
	if response and response.snapshot then
		registry:ApplySnapshot(response.snapshot)
	end
end

local function shouldDisableAfterRegistrationFailure(message)
	if type(message) ~= "string" then
		return false
	end

	return string.find(message, "No Roblox map template is configured for PlaceId", 1, true) ~= nil
end

local function disableBridge(reason)
	if bridgeDisabled then
		return
	end

	bridgeDisabled = true
	warn("[JOP] Bridge disabled: " .. tostring(reason))
end

local function synchronize()
	if bridgeDisabled then
		return
	end

	if syncInProgress then
		syncRequested = true
		return
	end
	syncInProgress = true
	repeat
		syncRequested = false
		local success, response = pcall(function()
			return api:FetchSnapshot(sessionId)
		end)
		if success then
			applyResponse(response)
		else
			warn("[JOP] Snapshot synchronization failed: " .. tostring(response))
		end
	until not syncRequested
	syncInProgress = false
end

local subscribed, subscribeResult = pcall(function()
	return MessagingService:SubscribeAsync(Config.MessagingTopic, function(message)
		local decoded = nil
		pcall(function()
			decoded = HttpService:JSONDecode(message.Data)
		end)
		if decoded and decoded.type == "session:changed" and decoded.sessionId == sessionId then
			task.spawn(synchronize)
		end
	end)
end)
if not subscribed then
	warn("[JOP] MessagingService subscription failed; periodic reconciliation remains active: " .. tostring(subscribeResult))
end

task.spawn(function()
	while true do
		local success, response = pcall(function()
			return api:Register(sessionId, placeId)
		end)
		if success then
			applyResponse(response)
			print(string.format("[JOP] Registered session %s for PlaceId %s", sessionId, placeId))
			break
		end

		if shouldDisableAfterRegistrationFailure(response) then
			disableBridge(response)
			return
		end

		warn("[JOP] Registration failed; retrying: " .. tostring(response))
		task.wait(10)
	end

	while true do
		if bridgeDisabled then
			return
		end

		task.wait(Config.ReconciliationIntervalSeconds)
		synchronize()
	end
end)
