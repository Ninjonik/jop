-- Cosmetic level-crossing lamps and barriers. The server remains authoritative
-- for crossing state, timing, and bells; each client interpolates
-- the visual barrier pose every render frame.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local CROSSING_TAG = "JOPLevelCrossingComponent"
local COMPONENT_TYPE_ATTRIBUTE = "JOPComponentType"
local ACTIVE_ATTRIBUTE = "JOPResolvedLevelCrossingActive"
local CHANGED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingChangedAt"
local RED_UNTIL_ATTRIBUTE = "JOPResolvedLevelCrossingRedUntil"
local WHITE_ENABLED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingWhiteEnabledAt"
local BARRIER_TARGET_ATTRIBUTE = "JOPResolvedLevelCrossingBarrierTarget"
local BARRIER_START_AT_ATTRIBUTE = "JOPResolvedLevelCrossingBarrierStartAt"
local BARRIER_DURATION_ATTRIBUTE = "JOPResolvedLevelCrossingBarrierDuration"
local RED_HALF_PERIOD = 0.5
local WHITE_HALF_PERIOD = 1
local WHITE_TWEEN_INFO = TweenInfo.new(0.2, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
local ACTIVE_RED = Color3.fromRGB(255, 0, 0)
local FAR_FUTURE_TIMESTAMP = 9e15
local BARRIER_DOWN_X = 0

local observed = {}
local crossings = {}
local normalBrightness = setmetatable({}, { __mode = "k" })
local lampTweens = setmetatable({}, { __mode = "k" })

local function isLevelCrossing(instance)
	local componentType = instance:GetAttribute(COMPONENT_TYPE_ATTRIBUTE)
	return (type(componentType) == "string" and string.lower(componentType) == "levelcrossing")
		or instance.Name == "Priecestie"
end

local function findParts(instance, names)
	local wanted = {}
	for _, name in ipairs(names) do wanted[name] = true end
	local parts = {}
	for _, descendant in ipairs(instance:GetDescendants()) do
		if descendant:IsA("BasePart") and wanted[descendant.Name] then
			table.insert(parts, descendant)
		end
	end
	return parts
end

local function findBarrierModels(instance)
	local barriers = {}
	for _, descendant in ipairs(instance:GetDescendants()) do
		if descendant:IsA("Model") and (descendant.Name == "ZÁV" or descendant.Name == "ZAV") then
			table.insert(barriers, descendant)
		end
	end
	return barriers
end

local function refreshBarrierPoses(state)
	state.barriers = findBarrierModels(state.instance)
	state.barrierUpPivots = state.barrierUpPivots or setmetatable({}, { __mode = "k" })
	for _, barrier in ipairs(state.barriers) do
		if not state.barrierUpPivots[barrier] then
			-- The server leaves barriers at their known raised rest pose; preserve
			-- it once and derive every client-side frame from it.
			state.barrierUpPivots[barrier] = barrier:GetPivot()
		end
	end
end

local function renderBarriers(state, now)
	local target = state.barrierTarget
	if target ~= "down" and target ~= "up" then return end
	local duration = state.barrierDuration
	local progress = duration > 0 and math.clamp((now - state.barrierStartAt) / duration, 0, 1) or 1
	local alpha = target == "down" and progress or 1 - progress

	for _, barrier in ipairs(state.barriers) do
		if barrier.Parent then
			local upPivot = state.barrierUpPivots[barrier]
			if upPivot then
				local _, yAngle, zAngle = upPivot:ToOrientation()
				local downPivot = CFrame.new(upPivot.Position) * CFrame.fromOrientation(BARRIER_DOWN_X, yAngle, zAngle)
				barrier:PivotTo(upPivot:Lerp(downPivot, alpha))
			end
		end
	end
end

local function setLamp(part, enabled, activeColor)
	part.Transparency = enabled and 0 or 1
	if enabled and activeColor then part.Color = activeColor end
	for _, descendant in ipairs(part:GetDescendants()) do
		if descendant:IsA("Light") then
			if normalBrightness[descendant] == nil then
				normalBrightness[descendant] = descendant.Brightness > 0 and descendant.Brightness or 1
			end
			if enabled and activeColor then descendant.Color = activeColor end
			descendant.Brightness = enabled and normalBrightness[descendant] or 0
		end
	end
end

local function tweenLampProperty(instance, properties)

	local previousTween = lampTweens[instance]
	if previousTween then previousTween:Cancel() end
	local tween = TweenService:Create(instance, WHITE_TWEEN_INFO, properties)
	lampTweens[instance] = tween
	tween:Play()
end

local function setWhiteLamp(part, enabled)

	tweenLampProperty(part, { Transparency = enabled and 0 or 1 })
	for _, descendant in ipairs(part:GetDescendants()) do
		if descendant:IsA("Light") then
			if normalBrightness[descendant] == nil then
				normalBrightness[descendant] = descendant.Brightness > 0 and descendant.Brightness or 1
			end
			tweenLampProperty(descendant, { Brightness = enabled and normalBrightness[descendant] or 0 })
		end
	end
end

local function applyParts(parts, enabled, activeColor)
	for _, part in ipairs(parts) do setLamp(part, enabled, activeColor) end
end

local function applyWhiteParts(parts, enabled)
	for _, part in ipairs(parts) do setWhiteLamp(part, enabled) end
end

local function refreshCrossing(instance)
	local state = crossings[instance]
	if not state then return end
	-- With StreamingEnabled, a crossing root can arrive before all of its
	-- Prejazd/Vystraznik lamp parts. Rebuild this small list whenever needed.
	state.white = findParts(instance, { "WhiteLight", "W" })
	state.redA = findParts(instance, { "RedLightA", "R" })
	state.redB = findParts(instance, { "RedLightB", "R1" })
	state.active = instance:GetAttribute(ACTIVE_ATTRIBUTE) == true
	state.changedAt = instance:GetAttribute(CHANGED_AT_ATTRIBUTE)
	if type(state.changedAt) ~= "number" then state.changedAt = Workspace:GetServerTimeNow() end
	state.redUntil = instance:GetAttribute(RED_UNTIL_ATTRIBUTE)
	if type(state.redUntil) ~= "number" then state.redUntil = state.changedAt end
	state.whiteEnabledAt = instance:GetAttribute(WHITE_ENABLED_AT_ATTRIBUTE)
	-- Do not guess that white is allowed while a replicated server attribute is
	-- pending. Failing closed prevents a false positive indication.
	if type(state.whiteEnabledAt) ~= "number" then state.whiteEnabledAt = FAR_FUTURE_TIMESTAMP end
	state.barrierTarget = instance:GetAttribute(BARRIER_TARGET_ATTRIBUTE)
	state.barrierStartAt = instance:GetAttribute(BARRIER_START_AT_ATTRIBUTE)
	if type(state.barrierStartAt) ~= "number" then state.barrierStartAt = Workspace:GetServerTimeNow() end
	state.barrierDuration = instance:GetAttribute(BARRIER_DURATION_ATTRIBUTE)
	if type(state.barrierDuration) ~= "number" or state.barrierDuration < 0 then state.barrierDuration = 0 end
	refreshBarrierPoses(state)
	state.lastPattern = nil
end

local function observeCrossing(instance)
	if observed[instance] or not isLevelCrossing(instance) then return end
	observed[instance] = true
	crossings[instance] = {
		white = findParts(instance, { "WhiteLight", "W" }),
		redA = findParts(instance, { "RedLightA", "R" }),
		redB = findParts(instance, { "RedLightB", "R1" }),
		active = false,
		changedAt = Workspace:GetServerTimeNow(),
		redUntil = Workspace:GetServerTimeNow(),
		whiteEnabledAt = Workspace:GetServerTimeNow(),
		barriers = findBarrierModels(instance),
		barrierUpPivots = setmetatable({}, { __mode = "k" }),
		barrierTarget = "up",
		barrierStartAt = Workspace:GetServerTimeNow(),
		barrierDuration = 0,
		lastPattern = nil,
	}
	instance:GetAttributeChangedSignal(ACTIVE_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(CHANGED_AT_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(RED_UNTIL_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(WHITE_ENABLED_AT_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(BARRIER_TARGET_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance.DescendantAdded:Connect(function(descendant)
		if descendant:IsA("BasePart") or descendant:IsA("Model") then refreshCrossing(instance) end
	end)
	instance.AncestryChanged:Connect(function(_, parent)
		if not parent then
			observed[instance] = nil
			crossings[instance] = nil
		end
	end)
	refreshCrossing(instance)
end

for _, instance in ipairs(CollectionService:GetTagged(CROSSING_TAG)) do observeCrossing(instance) end
CollectionService:GetInstanceAddedSignal(CROSSING_TAG):Connect(observeCrossing)
for _, instance in ipairs(game:GetDescendants()) do observeCrossing(instance) end
game.DescendantAdded:Connect(observeCrossing)

RunService.RenderStepped:Connect(function()
	local now = Workspace:GetServerTimeNow()
	for instance, state in pairs(crossings) do
		if not instance.Parent then
			crossings[instance] = nil
		else
			renderBarriers(state, now)
			local pattern
			if state.active or now < state.redUntil then
				local redAOn = math.floor((now - state.changedAt) / RED_HALF_PERIOD) % 2 == 0
				pattern = redAOn and "red-a" or "red-b"
			elseif now >= state.whiteEnabledAt then
				local whiteOn = math.floor((now - state.whiteEnabledAt) / WHITE_HALF_PERIOD) % 2 == 0
				pattern = whiteOn and "white-on" or "white-off"
			else
				pattern = "all-off"
			end

			if pattern ~= state.lastPattern then
				state.lastPattern = pattern
				applyWhiteParts(state.white, pattern == "white-on")
				applyParts(state.redA, pattern == "red-a", ACTIVE_RED)
				applyParts(state.redB, pattern == "red-b", ACTIVE_RED)
			end
		end
	end
end)
