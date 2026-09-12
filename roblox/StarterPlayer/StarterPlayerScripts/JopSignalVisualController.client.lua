-- Cosmetic signal rendering. The server replicates the aspect; clients render it.

local CollectionService = game:GetService("CollectionService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local SIGNAL_TAG = "JOPSignalComponent"
local SLOW_HALF_PERIOD = 0.575
local FAST_HALF_PERIOD = 0.275
local LAMP_FADE_TWEEN_INFO = TweenInfo.new(0.16, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut)
local GLASS_DECAL_NAME = "Sklíčko"
local GLASS_OFF_COLOR = Color3.fromRGB(70, 70, 70)
local GLASS_ON_COLOR = Color3.fromRGB(500, 500, 500)
local blinkingLamps = {}
local observedSignals = {}
local normalBrightness = setmetatable({}, { __mode = "k" })
local normalColors = setmetatable({}, { __mode = "k" })
local lampTweens = setmetatable({}, { __mode = "k" })

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

local function rememberNormalColor(instance)
	if normalColors[instance] == nil then normalColors[instance] = instance.Color end
	return normalColors[instance]
end

local function tweenLampProperties(instance, properties)
	local previousTween = lampTweens[instance]
	if previousTween then previousTween:Cancel() end
	local tween = TweenService:Create(instance, LAMP_FADE_TWEEN_INFO, properties)
	lampTweens[instance] = tween
	tween:Play()
end

local function findGlassDecal(lamp)
	local decal = lamp:FindFirstChild(GLASS_DECAL_NAME, true)
	return decal and decal:IsA("Decal") and decal or nil
end

local function setLampAppearance(lamp, enabled, openTransparency, closedTransparency)
	local lampColor = rememberNormalColor(lamp)
	tweenLampProperties(lamp, {
		Transparency = enabled and openTransparency or closedTransparency,
		Color = lampColor,
	})

	local glassDecal = findGlassDecal(lamp)
	if glassDecal then
		tweenLampProperties(glassDecal, {
			Color3 = enabled and GLASS_ON_COLOR or GLASS_OFF_COLOR,
		})
	end

	for _, descendant in ipairs(lamp:GetDescendants()) do
		if descendant:IsA("Light") then
			if normalBrightness[descendant] == nil then
				normalBrightness[descendant] = descendant.Brightness > 0 and descendant.Brightness or 1
			end
			local lightColor = rememberNormalColor(descendant)
			tweenLampProperties(descendant, {
				Brightness = enabled and normalBrightness[descendant] or 0,
				Color = lightColor,
			})
		end
	end
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
				blinkingLamps[lamp] = {
					mode = mode,
					open = open,
					closed = closed,
					changedAt = changedAt,
					isOn = nil,
				}
			else
				blinkingLamps[lamp] = nil
				setLampAppearance(lamp, mode == "on", open, closed)
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
			if state.isOn ~= isOn then
				state.isOn = isOn
				setLampAppearance(lamp, isOn, state.open, state.closed)
			end
		end
	end
end)
