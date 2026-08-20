-- This is the only module that should know the eventual in-game model structure.
-- Keep the bridge and web protocol unchanged when the physical implementation is added.

local HardwareDriver = {}

-- linkedStates contains every JOP tile linked to this Instance. Each entry has:
-- stationId, pieceId, pieceType, groups, texts, and switchAlignment.
function HardwareDriver.ApplyInstanceState(instance, linkedStates)
	-- TODO: Apply signal aspects, switch motors, lineblock indications, text, and
	-- other visual/physical state to the uniform model beneath `instance`.
	return true
end

-- report({ occupied = boolean, traversalState = string? }) when a sensor changes.
-- Return a disconnect function so the registry can safely rebuild observers.
function HardwareDriver.ObserveOccupation(instance, report)
	-- TODO: Connect the model's occupation sensors and invoke `report` on changes.
	return function() end
end

-- report({ controlSlot = "main"|"upper"|"lower", position = "left"|"right" })
-- when the physical switch reports its actual motor position.
function HardwareDriver.ObserveSwitchFeedback(instance, report)
	-- TODO: Connect the model's switch feedback signals and invoke `report`.
	return function() end
end

return HardwareDriver
