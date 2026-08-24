local TweenService = game:GetService("TweenService")

local SignalController = {}

local OPEN_TRANSPARENCY = 0.05
local CLOSED_TRANSPARENCY = 0.97
local DEFAULT_TWEEN = 0.15
local SLOW_BLINK = 0.575
local FAST_BLINK = 0.275

local signalStates = setmetatable({}, { __mode = "k" })

local function getOrCreateState(instance)
	local state = signalStates[instance]
	if state then
		return state
	end

	state = {
		version = 0,
	}
	signalStates[instance] = state
	return state
end

local function findLamp(instance, name)
	local lamp = instance:FindFirstChild(name, true)
	if lamp and lamp:IsA("BasePart") then
		return lamp
	end
	return nil
end

local function setLampTransparency(lamp, transparency, duration)
	local tween = TweenService:Create(
		lamp,
		TweenInfo.new(duration or DEFAULT_TWEEN, Enum.EasingStyle.Sine),
		{ Transparency = transparency }
	)
	tween:Play()
	return tween
end

local function turnOn(lamp, duration)
	setLampTransparency(lamp, OPEN_TRANSPARENCY, duration)
end

local function turnOff(lamp, duration, transparency)
	setLampTransparency(lamp, transparency or CLOSED_TRANSPARENCY, duration)
end

local function startBlink(instance, lamp, period)
	local state = getOrCreateState(instance)
	local version = state.version

	task.spawn(function()
		while signalStates[instance] and signalStates[instance].version == version do
			turnOn(lamp, period)
			task.wait(period)
			if not signalStates[instance] or signalStates[instance].version ~= version then
				break
			end
			turnOff(lamp, period)
			task.wait(period)
		end
	end)
end

local function buildResolvedAspectTable()
	-- These mappings mirror the canonical Roblox Aspects ModuleScript lamp codes.
	-- The backend already resolves family/aspect meaning; this controller only
	-- reflects the resolved aspect onto the physical lamps.
	return {
		off = {}, -- Legacy `sx`: all fitted lamps and speed indicators are off.
		danger = { c = "on" },
		caution = { z1 = "on" },
		proceed = { z = "on" },
		shunt = { b = "on" },
		proceed40Caution = { z1 = "on", z2 = "on", r4 = "on" },
		proceed40Proceed = { z = "on", z2 = "on", r4 = "on" },
		proceed40Expect40 = { z1 = "pulse2", z2 = "on", r4 = "on" },
		proceed40Expect60 = { z1 = "pulse3", z2 = "on", r4 = "on" },
		proceed40Expect80 = { z = "pulse2", z2 = "on", r4 = "on" },
		proceed40Expect100 = { z = "pulse3", z2 = "on", r4 = "on" },
		proceed30 = { z = "on", z2 = "on", r3 = "on" },
		proceed40 = { z = "on", z2 = "on", r4 = "on" },
		proceed50 = { z = "on", z2 = "on", r5 = "on" },
		proceed60 = { z = "on", z2 = "on", r6 = "on" },
		proceed80 = { z = "on", z2 = "on", r8 = "on" },
		proceed100 = { z = "on", z2 = "on", r10 = "on" },
		expect30 = { z1 = "pulse2" },
		expect40 = { z1 = "pulse2" },
		expect50 = { z1 = "pulse2" },
		expect60 = { z1 = "pulse3" },
		expect80 = { z = "pulse2" },
		expect100 = { z = "pulse3" },
	}
end

local RESOLVED_ASPECTS = buildResolvedAspectTable()
local CONTROLLED_LAMPS = {
	"z1",
	"z",
	"c",
	"b",
	"z2",
	"r3",
	"r4",
	"r5",
	"r6",
	"r8",
	"r10",
}

local function formatAspectConfig(aspectConfig)
	local fragments = {}

	for _, lampName in ipairs(CONTROLLED_LAMPS) do
		local mode = aspectConfig[lampName] or "off"
		table.insert(fragments, string.format("%s=%s", lampName, mode))
	end

	return table.concat(fragments, ", ")
end

function SignalController.Apply(instance, family, aspect)
	local state = getOrCreateState(instance)
	state.version += 1

	local aspectConfig = RESOLVED_ASPECTS[aspect] or {}
	-- The old premain signal script used 0.99 for an extinguished lamp. Other
	-- signal families used 0.97. Preserve those physical part values exactly.
	local closedTransparency = family == "premain" and 0.99 or CLOSED_TRANSPARENCY
	print(
		string.format(
			"[JOP][Signal] Applying %s family=%s aspect=%s lamps=[%s]",
			instance:GetFullName(),
			tostring(family),
			tostring(aspect),
			formatAspectConfig(aspectConfig)
		)
	)

	for _, lampName in ipairs(CONTROLLED_LAMPS) do
		local lamp = findLamp(instance, lampName)
		if lamp then
			local mode = aspectConfig[lampName]
			if mode == "on" then
				turnOn(lamp, DEFAULT_TWEEN)
			elseif mode == "pulse2" then
				turnOff(lamp, DEFAULT_TWEEN, closedTransparency)
				startBlink(instance, lamp, SLOW_BLINK)
			elseif mode == "pulse3" then
				turnOff(lamp, DEFAULT_TWEEN, closedTransparency)
				startBlink(instance, lamp, FAST_BLINK)
			else
				turnOff(lamp, DEFAULT_TWEEN, closedTransparency)
			end

			print(
				string.format(
					"[JOP][Signal] - %s lamp %s -> %s",
					instance:GetFullName(),
					lampName,
					tostring(mode or "off")
				)
			)
		end
	end
end

return SignalController
