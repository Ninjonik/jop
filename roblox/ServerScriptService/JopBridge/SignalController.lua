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

local function turnOff(lamp, duration)
	setLampTransparency(lamp, CLOSED_TRANSPARENCY, duration)
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

local function buildFamilyAspectTable()
	local expect40 = { z1 = "slow" }
	local expect60 = { z1 = "fast" }
	local expect80 = { z = "slow" }
	local expect100 = { z = "fast" }

	return {
		entry = {
			danger = { c = "on" },
			caution = { z1 = "on" },
			proceed = { z = "on" },
			shunt = { b = "on" },
			proceed40Caution = { z1 = "on", z2 = "on", r4 = "on" },
			proceed40Proceed = { z = "on", z2 = "on", r4 = "on" },
			proceed40Expect40 = { z1 = "slow", z2 = "on", r4 = "on" },
			proceed40Expect60 = { z1 = "fast", z2 = "on", r4 = "on" },
			proceed40Expect80 = { z = "slow", z2 = "on", r4 = "on" },
			proceed40Expect100 = { z = "fast", z2 = "on", r4 = "on" },
			proceed30 = { z = "on", z2 = "on", r3 = "on" },
			proceed40 = { z = "on", z2 = "on", r4 = "on" },
			proceed50 = { z = "on", z2 = "on", r5 = "on" },
			proceed60 = { z = "on", z2 = "on", r6 = "on" },
			proceed80 = { z = "on", z2 = "on", r8 = "on" },
			proceed100 = { z = "on", z2 = "on", r10 = "on" },
			expect30 = expect40,
			expect40 = expect40,
			expect50 = expect40,
			expect60 = expect60,
			expect80 = expect80,
			expect100 = expect100,
		},
		departure = {
			danger = { c = "on" },
			caution = { c = "on" },
			proceed = { z = "on" },
			shunt = { b = "on" },
			proceed40Caution = { c = "on", z2 = "on", r4 = "on" },
			proceed40Proceed = { z = "on", z2 = "on", r4 = "on" },
			proceed40Expect40 = { c = "on", z2 = "on", r4 = "on" },
			proceed40Expect60 = { c = "on", z2 = "on", r4 = "on" },
			proceed40Expect80 = { c = "on", z2 = "on", r4 = "on" },
			proceed40Expect100 = { c = "on", z2 = "on", r4 = "on" },
			proceed30 = { z = "on", z2 = "on", r3 = "on" },
			proceed40 = { z = "on", z2 = "on", r4 = "on" },
			proceed50 = { z = "on", z2 = "on", r5 = "on" },
			proceed60 = { z = "on", z2 = "on", r6 = "on" },
			proceed80 = { z = "on", z2 = "on", r8 = "on" },
			proceed100 = { z = "on", z2 = "on", r10 = "on" },
			expect30 = { c = "on" },
			expect40 = { c = "on" },
			expect50 = { c = "on" },
			expect60 = { c = "on" },
			expect80 = { c = "on" },
			expect100 = { c = "on" },
		},
		premain = {
			danger = { z1 = "on" },
			caution = { z1 = "on" },
			proceed = { z = "on" },
			shunt = { z1 = "on" },
			proceed40Caution = { z = "on" },
			proceed40Proceed = { z = "on" },
			proceed40Expect40 = { z = "on" },
			proceed40Expect60 = { z = "on" },
			proceed40Expect80 = { z = "on" },
			proceed40Expect100 = { z = "on" },
			proceed30 = { z = "on" },
			proceed40 = { z = "on" },
			proceed50 = { z = "on" },
			proceed60 = { z = "on" },
			proceed80 = { z = "on" },
			proceed100 = { z = "on" },
			expect30 = expect40,
			expect40 = expect40,
			expect50 = expect40,
			expect60 = expect60,
			expect80 = expect80,
			expect100 = expect100,
		},
		shunt = {
			danger = { c = "on" },
			caution = {},
			proceed = { c = "on" },
			shunt = { b = "on" },
			proceed40Caution = { c = "on" },
			proceed40Proceed = { c = "on" },
			proceed40Expect40 = { c = "on" },
			proceed40Expect60 = { c = "on" },
			proceed40Expect80 = { c = "on" },
			proceed40Expect100 = { c = "on" },
			proceed30 = { c = "on" },
			proceed40 = { c = "on" },
			proceed50 = { c = "on" },
			proceed60 = { c = "on" },
			proceed80 = { c = "on" },
			proceed100 = { c = "on" },
			expect30 = {},
			expect40 = {},
			expect50 = {},
			expect60 = {},
			expect80 = {},
			expect100 = {},
		},
	}
end

local FAMILY_ASPECTS = buildFamilyAspectTable()
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

function SignalController.Apply(instance, family, aspect)
	local state = getOrCreateState(instance)
	state.version += 1

	local familyConfig = FAMILY_ASPECTS[family]
	local aspectConfig = familyConfig and familyConfig[aspect] or {}

	for _, lampName in ipairs(CONTROLLED_LAMPS) do
		local lamp = findLamp(instance, lampName)
		if lamp then
			local mode = aspectConfig[lampName]
			if mode == "on" then
				turnOn(lamp, DEFAULT_TWEEN)
			elseif mode == "slow" then
				turnOff(lamp, DEFAULT_TWEEN)
				startBlink(instance, lamp, SLOW_BLINK)
			elseif mode == "fast" then
				turnOff(lamp, DEFAULT_TWEEN)
				startBlink(instance, lamp, FAST_BLINK)
			else
				turnOff(lamp, DEFAULT_TWEEN)
			end
		end
	end
end

return SignalController
