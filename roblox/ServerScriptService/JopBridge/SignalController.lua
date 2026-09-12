-- Server authority for signal aspects. Continuous blinking is rendered by
-- StarterPlayerScripts/JopSignalVisualController.client.lua on each client.

local SignalController = {}

local OPEN_TRANSPARENCY = 0.05
local CLOSED_TRANSPARENCY = 0.97
local CONTROLLED_LAMPS = { "z1", "z", "c", "b", "z2", "r3", "r4", "r5", "r6", "r8", "r10" }

local RESOLVED_ASPECTS = {
	danger = { c = "on" }, caution = { z1 = "on" }, proceed = { z = "on" }, shunt = { b = "on" },
	callOn = { c = "on", b = "blinkSlow" },
	proceed40Caution = { z1 = "on", z2 = "on", r4 = "on" },
	proceed40Proceed = { z = "on", z2 = "on", r4 = "on" },
	proceed40Expect40 = { z1 = "blinkSlow", z2 = "on", r4 = "on" },
	proceed40Expect60 = { z1 = "blinkFast", z2 = "on", r4 = "on" },
	proceed40Expect80 = { z = "blinkSlow", z2 = "on", r4 = "on" },
	proceed40Expect100 = { z = "blinkFast", z2 = "on", r4 = "on" },
	expect30 = { z1 = "blinkSlow" }, expect40 = { z1 = "blinkSlow" }, expect50 = { z1 = "blinkSlow" },
	expect60 = { z1 = "blinkFast" }, expect80 = { z = "blinkSlow" }, expect100 = { z = "blinkFast" },
}

local function getOpenTransparency(family)
	if family == "entry" or family == "shunt" then return 0 end
	if family == "departure" then return 0.1 end
	return OPEN_TRANSPARENCY
end

local function getClosedTransparency(family)
	return family == "premain" and 0.99 or CLOSED_TRANSPARENCY
end

local function serializeLampModes(config)
	local modes = {}
	for _, lampName in ipairs(CONTROLLED_LAMPS) do
		table.insert(modes, lampName .. "=" .. (config[lampName] or "off"))
	end
	return table.concat(modes, ";")
end

function SignalController.Apply(instance, family, aspect)
	local config = RESOLVED_ASPECTS[aspect] or {}
	local openTransparency = getOpenTransparency(family)
	local closedTransparency = getClosedTransparency(family)

	-- The client owns all lamp presentation so a replicated aspect change can
	-- fade instead of snapping. These attributes remain the server-authoritative
	-- description of the requested aspect and blink modes.
	instance:SetAttribute("JOPResolvedSignalLampModes", serializeLampModes(config))
	instance:SetAttribute("JOPResolvedSignalOpenTransparency", openTransparency)
	instance:SetAttribute("JOPResolvedSignalClosedTransparency", closedTransparency)
end

return SignalController
