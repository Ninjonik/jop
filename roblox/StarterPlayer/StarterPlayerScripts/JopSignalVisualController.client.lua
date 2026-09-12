-- Cosmetic signal rendering. The server replicates the aspect; clients render it.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local SIGNAL_TAG = "JOPSignalComponent"
local SLOW_HALF_PERIOD = 0.575
local FAST_HALF_PERIOD = 0.275
local blinkingLamps = {}
local observedSignals = {}

local function findLamp(instance, name)
	local lamp = instance:FindFirstChild(name, true)
	return lamp and lamp:IsA("BasePart") and lamp or nil
end

local function parseLampModes(serialized)
	local modes = {}
	for pair in string.gmatch(serialized or "", "[^;]+") do
		local name, mode = string.match(pair, "^([^=]+)=(.+)$")
		if name and mode then modes[name] = mode end
	end
	return modes
end

local function refreshSignal(instance)
	local modes = parseLampModes(instance:GetAttribute("JOPResolvedSignalLampModes"))
	local open = instance:GetAttribute("JOPResolvedSignalOpenTransparency")
	local closed = instance:GetAttribute("JOPResolvedSignalClosedTransparency")
	local changedAt = instance:GetAttribute("JOPResolvedSignalChangedAt")
	if type(open) ~= "number" or type(closed) ~= "number" or type(changedAt) ~= "number" then return end

	for name, mode in pairs(modes) do
		local lamp = findLamp(instance, name)
		if lamp then
			if mode == "blinkSlow" or mode == "blinkFast" or mode == "pulse2" or mode == "pulse3" then
				blinkingLamps[lamp] = { mode = mode, open = open, closed = closed, changedAt = changedAt }
			else
				blinkingLamps[lamp] = nil
				lamp.Transparency = mode == "on" and open or closed
			end
		end
	end
end

local function observeSignal(instance)
	if observedSignals[instance] then return end
	observedSignals[instance] = true
	instance:GetAttributeChangedSignal("JOPResolvedSignalLampModes"):Connect(function() refreshSignal(instance) end)
	instance:GetAttributeChangedSignal("JOPResolvedSignalChangedAt"):Connect(function() refreshSignal(instance) end)
	instance.AncestryChanged:Connect(function(_, parent)
		if not parent then observedSignals[instance] = nil end
	end)
	refreshSignal(instance)
end

for _, instance in ipairs(CollectionService:GetTagged(SIGNAL_TAG)) do observeSignal(instance) end
CollectionService:GetInstanceAddedSignal(SIGNAL_TAG):Connect(observeSignal)

RunService.RenderStepped:Connect(function()
	local now = Workspace:GetServerTimeNow()
	for lamp, state in pairs(blinkingLamps) do
		if not lamp.Parent then
			blinkingLamps[lamp] = nil
		else
			local halfPeriod = (state.mode == "blinkSlow" or state.mode == "pulse2")
				and SLOW_HALF_PERIOD
				or FAST_HALF_PERIOD
			local isOn = math.floor((now - state.changedAt) / halfPeriod) % 2 == 0
			lamp.Transparency = isOn and state.open or state.closed
		end
	end
end)
