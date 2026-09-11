-- Cosmetic level-crossing lamps. The server remains authoritative for active
-- state, barriers, bells, and the delayed return of the white indication.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local CROSSING_TAG = "JOPLevelCrossingComponent"
local COMPONENT_TYPE_ATTRIBUTE = "JOPComponentType"
local ACTIVE_ATTRIBUTE = "JOPResolvedLevelCrossingActive"
local CHANGED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingChangedAt"
local WHITE_ENABLED_AT_ATTRIBUTE = "JOPResolvedLevelCrossingWhiteEnabledAt"
local HALF_PERIOD = 0.5

local observed = {}
local crossings = {}
local normalBrightness = setmetatable({}, { __mode = "k" })

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

local function setLamp(part, enabled)
	part.Transparency = enabled and 0 or 1
	for _, descendant in ipairs(part:GetDescendants()) do
		if descendant:IsA("Light") then
			if normalBrightness[descendant] == nil then
				normalBrightness[descendant] = descendant.Brightness > 0 and descendant.Brightness or 1
			end
			descendant.Brightness = enabled and normalBrightness[descendant] or 0
		end
	end
end

local function applyParts(parts, enabled)
	for _, part in ipairs(parts) do setLamp(part, enabled) end
end

local function refreshCrossing(instance)
	local state = crossings[instance]
	if not state then return end
	state.active = instance:GetAttribute(ACTIVE_ATTRIBUTE) == true
	state.changedAt = instance:GetAttribute(CHANGED_AT_ATTRIBUTE)
	if type(state.changedAt) ~= "number" then state.changedAt = Workspace:GetServerTimeNow() end
	state.whiteEnabledAt = instance:GetAttribute(WHITE_ENABLED_AT_ATTRIBUTE)
	if type(state.whiteEnabledAt) ~= "number" then state.whiteEnabledAt = state.changedAt end
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
		whiteEnabledAt = Workspace:GetServerTimeNow(),
		lastPattern = nil,
	}
	instance:GetAttributeChangedSignal(ACTIVE_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(CHANGED_AT_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
	instance:GetAttributeChangedSignal(WHITE_ENABLED_AT_ATTRIBUTE):Connect(function() refreshCrossing(instance) end)
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
			local pattern
			if state.active then
				local redAOn = math.floor((now - state.changedAt) / HALF_PERIOD) % 2 == 0
				pattern = redAOn and "red-a" or "red-b"
			elseif now >= state.whiteEnabledAt then
				local whiteOn = math.floor((now - state.whiteEnabledAt) / HALF_PERIOD) % 2 == 0
				pattern = whiteOn and "white-on" or "white-off"
			else
				pattern = "all-off"
			end

			if pattern ~= state.lastPattern then
				state.lastPattern = pattern
				applyParts(state.white, pattern == "white-on")
				applyParts(state.redA, pattern == "red-a")
				applyParts(state.redB, pattern == "red-b")
			end
		end
	end
end)
